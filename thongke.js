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
  const tvCount = db.exec(`SELECT COUNT(*) FROM ThanhVien WHERE tv_tour_id = ${tourId}`)[0]?.values[0][0] || 0;
  document.getElementById("stat-members").textContent = tvCount;

  const income = db.exec(`SELECT SUM(dg_so_tien) FROM DongGop WHERE dg_tour_id = ${tourId}`)[0]?.values[0][0] || 0;
  document.getElementById("stat-income").textContent = income.toLocaleString() + " ₫";

  const expense = db.exec(`SELECT SUM(ct_so_tien) FROM ChiTieu WHERE ct_tour_id = ${tourId}`)[0]?.values[0][0] || 0;
  document.getElementById("stat-expense").textContent = expense.toLocaleString() + " ₫";

  const balance = income - expense;
  const balanceEl = document.getElementById("stat-balance");
  balanceEl.textContent = (balance >= 0 ? "+" : "") + balance.toLocaleString() + " ₫";
  balanceEl.style.color = balance >= 0 ? "green" : "red";

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

    const nameEl = document.createElement("div");
    nameEl.className = "category-name";
    nameEl.innerHTML = `${name}: <span style="font-weight: normal; color: green;">${amount.toLocaleString()} ₫</span> – ${percent}%`;

    const progressWrapper = document.createElement("div");
    progressWrapper.style.paddingLeft = "0px";
    progressWrapper.style.paddingRight = "0px";
    progressWrapper.style.marginTop = "6px";
    progressWrapper.style.boxSizing = "border-box";

    const progress = document.createElement("div");
    progress.className = "progress-bar-bg";
    progress.style.width = "100%";

    const fill = document.createElement("div");
    fill.className = "progress-bar-fill";
    fill.style.width = `${percent}%`;

    progress.appendChild(fill);
    progressWrapper.appendChild(progress);

    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.flexDirection = "column";
    topRow.style.flex = "1";

    topRow.appendChild(nameEl);
    topRow.appendChild(progressWrapper);
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
      div.textContent = `${i + 1}. ${ten} - ${sotien.toLocaleString()} ₫ - ${formatDateTime(thoigian)}${ghichu ? " - " + ghichu : ""}`;
      details.appendChild(div);
    });

    block.appendChild(header);
    block.appendChild(details);
    container.appendChild(block);
  });

  // ✅ Thống kê theo ngày
  const dateStats = db.exec(`
    SELECT DATE(ct_thoi_gian), SUM(ct_so_tien)
    FROM ChiTieu
    WHERE ct_tour_id = ${tourId}
    GROUP BY DATE(ct_thoi_gian)
    ORDER BY DATE(ct_thoi_gian)
  `)[0]?.values || [];

  const labels = dateStats.map(([date]) => {
    const [y, m, d] = date.split("-");
    return `${d}-${m}-${y}`;
  });

  const values = dateStats.map(([, amount]) => amount);

  renderDailyCharts(labels, values);
}


function formatDateTime(dt) {
  if (!dt) return "";
  const date = new Date(dt);
  if (isNaN(date.getTime())) return dt;

  // Định dạng giờ:phút không có giây
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Biểu đồ
let barChart, lineChart;

function renderDailyCharts(labels, values) {
  // Hủy biểu đồ cũ nếu có
  if (barChart) barChart.destroy();
  if (lineChart) lineChart.destroy();

  const barCtx = document.getElementById("dailyBarChart").getContext("2d");
  const lineCtx = document.getElementById("dailyLineChart").getContext("2d");

  barChart = new Chart(barCtx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Chi tiêu mỗi ngày",
        data: values,
        backgroundColor: "#4e79a7"
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: true, text: "Biểu đồ cột – Chi tiêu theo ngày" }
      },
      scales: {
        y: {
          ticks: {
            callback: value => value.toLocaleString() + " ₫"
          }
        }
      }
    }
  });

  lineChart = new Chart(lineCtx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Chi tiêu mỗi ngày",
        data: values,
        borderColor: "#f28e2b",
        backgroundColor: "rgba(242, 142, 43, 0.2)",
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: true, text: "Biểu đồ đường – Chi tiêu theo ngày" }
      },
      scales: {
        y: {
          ticks: {
            callback: value => value.toLocaleString() + " ₫"
          }
        }
      }
    }
  });
}

