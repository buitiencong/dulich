let db;
let SQL;

initSqlJs({
  locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${file}`
}).then(SQLLib => {
  SQL = SQLLib;
  localforage.getItem("userDB").then(buffer => {
    if (buffer) {
      db = new SQL.Database(new Uint8Array(buffer));
      loadPaymentHistory();
    } else {
      alert("⚠️ Không tìm thấy dữ liệu.");
    }
  });
});

function loadPaymentHistory(query = null) {
  const table = document.querySelector("#paymentTable tbody");
  table.innerHTML = "";

  let sql = `
  SELECT Thuhocphi_id, strftime('%d/%m/%Y', Thuhocphi_date)
 AS date,
         student_name, class_name, Thuhocphi_money
  FROM Thuhocphi
  ORDER BY Thuhocphi_date DESC
`;


  let rows = db.exec(query || sql)[0]?.values || [];

  rows.forEach(([id, date, name, classname, money], index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${date}</td>
      <td>${name}</td>
      <td>${classname}</td>
      <td>${Number(money).toLocaleString()} ₫</td>
      <td>
        <button onclick="deletePayment(${id})"
            style="
            background: none;
            border: none;
            padding: 0;
            cursor: pointer;
            font-size: 18px;
            "
            title="Xoá">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
        </button>
    </td>

    `;
    table.appendChild(tr);
  });
}

function searchByName() {
  const name = document.getElementById("search-name").value.trim();
  if (!name) return;

  const sql = `
    SELECT Thuhocphi_id, strftime('%d/%m/%Y', Thuhocphi_date)
,
          student_name, class_name, Thuhocphi_money
    FROM Thuhocphi
    WHERE student_name LIKE '%${name}%'
    ORDER BY Thuhocphi_date DESC
  `;


  loadPaymentHistory(sql);
}

function searchByDate() {
  const start = document.getElementById("start-date").value;
  const end = document.getElementById("end-date").value;

  if (!start || !end) {
    alert("Vui lòng chọn đủ ngày bắt đầu và kết thúc.");
    return;
  }

  const sql = `
    SELECT Thuhocphi_id, strftime('%d/%m/%Y', Thuhocphi_date)
,
          student_name, class_name, Thuhocphi_money
    FROM Thuhocphi
    WHERE date(Thuhocphi_date) BETWEEN '${start}' AND '${end}'
    ORDER BY Thuhocphi_date DESC
  `;

  loadPaymentHistory(sql);
}

function deletePayment(id) {
  if (!confirm("Bạn có chắc chắn muốn xoá bản ghi này?")) return;

  // Lấy student_id để cập nhật lại noptien
  const result = db.exec(`SELECT student_id FROM Thuhocphi WHERE Thuhocphi_id = ${id}`);
  const studentId = result[0]?.values[0]?.[0];
  if (studentId) {
    db.run(`UPDATE Students SET noptien = 0 WHERE student_id = ?`, [studentId]);
  }

  db.run(`DELETE FROM Thuhocphi WHERE Thuhocphi_id = ?`, [id]);
  localforage.setItem("userDB", db.export());
  loadPaymentHistory();
}


function handleSearchClick() {
  const btn = document.getElementById("search-btn");

  // 👇 hiệu ứng scale nhỏ
  btn.style.transform = "scale(0.95)";
  btn.style.backgroundColor = "#005fa3"; // hiệu ứng màu đậm hơn

  // Gọi chức năng tìm kiếm
  searchByName();

  // 👆 Khôi phục lại sau 200ms
  setTimeout(() => {
    btn.style.transform = "scale(1)";
    btn.style.backgroundColor = "#007acc";
  }, 200);
}
