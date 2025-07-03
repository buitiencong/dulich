let db, SQL;

initSqlJs({
  locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${file}`
}).then(SQLLib => {
  SQL = SQLLib;
  localforage.getItem("userDB").then(buffer => {
    if (buffer) {
      db = new SQL.Database(new Uint8Array(buffer));
      loadTourList();
    } else {
      alert("Không tìm thấy dữ liệu tour.");
    }
  });
});

function loadTourList() {
  const result = db.exec("SELECT tour_id, tour_ten FROM Tour ORDER BY tour_ngay_di DESC");
  const select = document.getElementById("tourSelect");
  result[0]?.values.forEach(([id, name]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = name;
    select.appendChild(option);
  });
  select.addEventListener("change", () => showStats(parseInt(select.value)));

  if (result[0]?.values.length > 0) {
    select.value = result[0].values[0][0];
    showStats(result[0].values[0][0]);
  }
}

function showStats(tourId) {
  // Thành viên
  const tvCount = db.exec(`SELECT COUNT(*) FROM ThanhVien WHERE tv_tour_id = ${tourId}`)[0]?.values[0][0] || 0;
  document.getElementById("stat-members").textContent = tvCount;

  // Tổng thu
  const income = db.exec(`SELECT SUM(dg_so_tien) FROM DongGop WHERE dg_tour_id = ${tourId}`)[0]?.values[0][0] || 0;
  document.getElementById("stat-income").textContent = income.toLocaleString() + " ₫";

  // Tổng chi
  const expense = db.exec(`SELECT SUM(ct_so_tien) FROM ChiTieu WHERE ct_tour_id = ${tourId}`)[0]?.values[0][0] || 0;
  document.getElementById("stat-expense").textContent = expense.toLocaleString() + " ₫";

  // Còn lại
  const balance = income - expense;
  document.getElementById("stat-balance").textContent = (balance >= 0 ? "+" : "") + balance.toLocaleString() + " ₫";
  document.getElementById("stat-balance").style.color = balance >= 0 ? "green" : "red";

  // Phân tích danh mục chi
  const categoryStats = db.exec(`
    SELECT dm.dm_id, dm.dm_ten, SUM(ct.ct_so_tien)
    FROM ChiTieu ct
    LEFT JOIN DanhMuc dm ON dm.dm_id = ct.ct_danh_muc_id
    WHERE ct_tour_id = ${tourId}
    GROUP BY dm.dm_id, dm.dm_ten
  `);

  const list = categoryStats[0]?.values || [];
  const total = list.reduce((sum, [, , amount]) => sum + amount, 0);

  const container = document.getElementById("categoryStats");
  container.innerHTML = "";

  list.forEach(([dm_id, name, amount]) => {
    const percent = total > 0 ? Math.round((amount / total) * 100) : 0;
    const block = document.createElement("div");
    block.className = "category-block";

    const header = document.createElement("div");
    header.className = "category-header";
    header.onclick = () => {
      details.classList.toggle("open");
    };

    const topRow = document.createElement("div");
    topRow.className = "category-top";

    const nameEl = document.createElement("div");
    nameEl.className = "category-name";
    nameEl.textContent = `${name} – ${percent}%`;

    const progress = document.createElement("div");
    progress.className = "progress-bar-bg";
    const fill = document.createElement("div");
    fill.className = "progress-bar-fill";
    fill.style.width = `${percent}%`;
    progress.appendChild(fill);

    topRow.appendChild(nameEl);
    topRow.appendChild(progress);
    header.appendChild(topRow);

    const details = document.createElement("div");
    details.className = "expense-list";

    const detailRows = db.exec(`
      SELECT ct_ten_khoan, ct_so_tien, ct_thoi_gian, ct_ghi_chu 
      FROM ChiTieu 
      WHERE ct_tour_id = ${tourId} AND ct_danh_muc_id = ${dm_id} 
      ORDER BY ct_thoi_gian ASC
    `);

    const rows = detailRows[0]?.values || [];
    rows.forEach((row, i) => {
      const div = document.createElement("div");
      div.className = "expense-item";
      const [ten, sotien, thoigian, ghichu] = row;
      div.textContent = `${i + 1}. ${ten} - ${sotien.toLocaleString()} ₫ - ${formatDateTime(thoigian)} - ${ghichu || ""}`;
      details.appendChild(div);
    });

    block.appendChild(header);
    block.appendChild(details);
    container.appendChild(block);
  });
}

function formatDateTime(dt) {
  if (!dt) return "";
  const date = new Date(dt);
  if (isNaN(date.getTime())) return dt;
  return date.toLocaleString("vi-VN");
}
