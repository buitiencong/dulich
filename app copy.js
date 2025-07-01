let db;
let SQL;
let thuFilterState = {
  dathu: false,
  chuathu: false
};

let deferredPrompt = null;
let isIntroClosed = false;


document.addEventListener("DOMContentLoaded", () => {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);

  // ✅ iOS: hiển thị hướng dẫn ngay lập tức
  if (!isStandalone && isIOS) {
    document.getElementById("addtoscreenios")?.style.setProperty("display", "flex");
  }

  if (!isStandalone && isAndroid) {
    setTimeout(() => {
      document.getElementById("addtoscreenadr")?.style.setProperty("display", "flex");
    }, 1000); // có thể chờ 1s để DOM ổn định
  }

  // Xử lý mở menu cho mobile
  const toggleBtn = document.getElementById("menuToggle");
  const menuBar = document.querySelector(".menu-bar");

  if (toggleBtn && menuBar) {
    toggleBtn.addEventListener("click", () => {
      menuBar.classList.toggle("open");
    });
  }

  // 👇 Thêm đoạn này để cập nhật thống kê khi vừa vào trang
  const classId = document.querySelector(".tab-button.active")?.dataset.classId;
  if (classId) {
    updateThuHocPhiThongKe(classId);
  }
  // ✅ Gọi hàm nhảy Enter cho cả 2 modal sau khi DOM sẵn sàng
  enableEnterToJump('#themTourModal', '.modal-actions button');
  enableEnterToJump('#suaTourModal', '.modal-actions button');
});



// Khởi tạo SQLite và kiểm tra dữ liệu từ IndexedDB
initSqlJs({
  locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${file}`
}).then(SQLLib => {
  SQL = SQLLib;

  // ✅ Thêm dòng sau để tránh lỗi khi chạy dưới PWA (không có form intro)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) {
    isIntroClosed = true;
  }

  localforage.getItem("userDB").then(buffer => {
    if (buffer instanceof Uint8Array || buffer?.length) {
      db = new SQL.Database(new Uint8Array(buffer));
      loadTour();

      if (isIntroClosed) {
        checkIfNoClasses();
        autoExportIfNeeded();
      } else {
        window._pendingInitAfterIntro = () => {
          checkIfNoClasses();
          autoExportIfNeeded();
        };
      }
    } else {
      initNewDatabase(); // ✅ KHỞI TẠO DB MỚI nếu không có
    }
  });


  document.getElementById("dbfile").addEventListener("change", function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();

    reader.onload = function () {
      const uint8array = new Uint8Array(reader.result);
      db = new SQL.Database(uint8array);
      localforage.setItem("userDB", uint8array);
      localStorage.setItem("hasOpenedDb", "1");
      closeDbModal();
      loadTour();

      // Nếu đang chạy dưới PWA (standalone) → không có form hướng dẫn ⇒ gọi luôn
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
      if (isStandalone) {
        isIntroClosed = true; // ✅ đảm bảo điều kiện
      }

      if (isIntroClosed) {
        checkIfNoClasses();
        autoExportIfNeeded();
      } else {
        window._pendingInitAfterIntro = () => {
          checkIfNoClasses();
          autoExportIfNeeded();
        };
      }

    };

    reader.readAsArrayBuffer(file);
  });
});


// Khởi tạo Cơ sở dữ liệu
function initNewDatabase() {
  db = new SQL.Database();

db.run(`
  CREATE TABLE IF NOT EXISTS Tour (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ten TEXT NOT NULL,
    dia_diem TEXT,
    ngay_di DATE NOT NULL,
    ngay_ve DATE NOT NULL,
    mo_ta TEXT
  );

  CREATE TABLE IF NOT EXISTS ThanhVien (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tour_id INTEGER,
    ho_ten TEXT NOT NULL,
    gioi_tinh INTEGER, -- 0: nữ, 1: nam
    sdt TEXT,
    ghi_chu TEXT,
    ty_le_dong REAL DEFAULT 1.0,
    FOREIGN KEY (tour_id) REFERENCES Tour(id)
  );

  CREATE TABLE IF NOT EXISTS ChiTieu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tour_id INTEGER,
    thoi_gian DATETIME NOT NULL,
    ten_khoan TEXT NOT NULL,
    so_tien INTEGER NOT NULL,
    nguon_quy_chung BOOLEAN DEFAULT 1, -- 1: dùng quỹ chung, 0: có người ứng
    nguoi_ung_tien_id INTEGER, -- nullable nếu dùng quỹ
    ghi_chu TEXT,
    FOREIGN KEY (tour_id) REFERENCES Tour(id),
    FOREIGN KEY (nguoi_ung_tien_id) REFERENCES ThanhVien(id)
  );

  CREATE TABLE IF NOT EXISTS DongGop (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tour_id INTEGER,
    thanh_vien_id INTEGER,
    so_tien INTEGER NOT NULL,
    thoi_gian DATETIME NOT NULL,
    ghi_chu TEXT,
    FOREIGN KEY (tour_id) REFERENCES Tour(id),
    FOREIGN KEY (thanh_vien_id) REFERENCES ThanhVien(id)
  );
`);


  saveToLocal();         // ✅ Lưu DB mới vào localforage
  loadTour();         // ✅ Cập nhật UI
  if (isIntroClosed) {
    checkIfNoClasses();
    autoExportIfNeeded();
  } else {
    window._pendingInitAfterIntro = () => {
      checkIfNoClasses();
      autoExportIfNeeded();
    };
  }
}



// Check xem có danh sách lớp nào được tạo hay chưa
function checkIfNoClasses() {
  try {
    const result = db.exec("SELECT COUNT(*) FROM Classes");
    const count = result[0]?.values[0][0] || 0;
    if (count === 0) {
      // ✅ Trì hoãn 1 chút để đảm bảo alert không bị chặn trong PWA
      setTimeout(() => {
        alert("🏫 Chưa có lớp nào được tạo.\n"+"      Hãy tạo lớp mới để bắt đầu.");
        handleThemTour(); // 👈 mở form thêm lớp sau alert
      }, 200);
    }
  } catch (err) {
    console.error("Lỗi khi kiểm tra lớp:", err.message);
  }
}


// Check xem trong lớp có học sinh nào chưa
function checkIfNoStudents(classId) {
  try {
    const result = db.exec(`SELECT COUNT(*) FROM Students WHERE class_id = ${classId}`);
    const count = result[0]?.values?.[0]?.[0] || 0;

    if (count === 0) {
      setTimeout(() => {
        alert("🤷‍♂️ Lớp này chưa có học sinh.\n"+"      Hãy thêm học sinh vào lớp.");
        setTimeout(() => handleThemTv(), 100); // vẫn giữ delay nhẹ sau alert
      }, 0);
    }
  } catch (err) {
    console.error("Lỗi kiểm tra học sinh:", err.message);
  }
}



// Hàm để lưu các thay đổi cơ sở dữ liệu
function saveToLocal() {
  if (db) {
    const data = db.export();
    localforage.setItem("userDB", data);
  }
}



window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
});



// Hàm toast hỗ trợ IOS
function showToast(message, svgIcon = '', centered = false) {
  const toast = document.createElement('div');
  toast.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      min-width: 300px;
      max-width: 90%;
      background: #212121;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      z-index: 9999;
      opacity: 1;
      transition: opacity 0.5s ease;
      ${centered ? 'display: block; text-align: center;' : 'display: flex; align-items: center; gap: 10px;'}
    ">
      ${svgIcon}
      <span>${message}</span>
    </div>
  `;
  const el = toast.firstElementChild;
  document.body.appendChild(el);

  // Tự động biến mất sau 10 giây
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 500);
  }, 10000);
}


// Định dạng ngày dd-mm-yy
function formatDate(isoDate) {
  const d = new Date(isoDate);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

function loadTour(selectedTourId = null) {
  const tabs = document.getElementById("tabs");
  const contents = document.getElementById("tabContents");
  tabs.innerHTML = "";
  contents.innerHTML = "";

  let tours;
  try {
    tours = db.exec("SELECT id, ten FROM Tour");
  } catch (err) {
    tabs.innerHTML = "<p>Lỗi: " + err.message + "</p>";
    return;
  }

  if (!tours.length) {
    tabs.innerHTML = "<p>Không có tour nào.</p>";
    return;
  }

  tours[0].values.forEach(([tourId, tourName], index) => {
    const tabBtn = document.createElement("div");
    tabBtn.className = "tab-button";
    tabBtn.textContent = tourName;
    tabBtn.dataset.tourId = tourId;
    tabBtn.onclick = () => switchTab(tourId);

    const isActive = selectedTourId ? tourId == selectedTourId : index === 0;
    if (isActive) tabBtn.classList.add("active");

    tabs.appendChild(tabBtn);

    const contentDiv = document.createElement("div");
    contentDiv.className = "tab-content" + (isActive ? " active" : "");
    contentDiv.id = `tab-${tourId}`;
    contents.appendChild(contentDiv);

    if (isActive) {
      showTourData(tourId);              // 👈 Hiển thị dữ liệu tour (tùy bạn định nghĩa)
      updateThongKeTour(tourId);         // 👈 Hiển thị thống kê thu - chi tour (tùy bạn định nghĩa)
    }
  });
}



function switchTab(classId) {
  const currentActive = document.querySelector(".tab-button.active")?.dataset.classId;
  if (currentActive == classId) return; // tránh gọi lại khi nhấn tab đang active

  document.querySelectorAll(".tab-button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.classId == classId);
  });
  document.querySelectorAll(".tab-content").forEach(div => {
    div.classList.toggle("active", div.id === `tab-${classId}`);
  });

  showClassData(classId);
  updateThuHocPhiThongKe(classId);

  checkIfNoStudents(classId); // luôn kiểm tra khi chuyển tab
}





// Hiển thị bảng danh sách học sinh
function showClassData(classId, filter = null) {
  const container = document.getElementById(`tab-${classId}`);
  container.innerHTML = "<p>Đang tải...</p>";

  try {
    // ✅ Lấy danh sách học sinh
    let query = `SELECT student_id, student_name, noptien FROM Students WHERE class_id = ${classId}`;
    if (filter !== null) {
      query += ` AND noptien = ${filter}`;
    }
    const studentResult = db.exec(query);
    const students = studentResult[0]?.values || [];

    // ✅ Lấy danh sách ngày điểm danh
    const datesResult = db.exec(`
      SELECT DISTINCT attendance_date FROM Attendance
      WHERE class_id = ${classId} AND status = 1
      ORDER BY attendance_date ASC
    `);
    const allDates = datesResult[0]?.values.map(r => r[0]) || [];

    // ✅ Lấy thông tin lớp
    const classInfoRes = db.exec(`
      SELECT class_name, class_hocphi, class_time, class_diadiem
      FROM Classes
      WHERE class_id = ${classId}
    `);
    const [class_name, class_hocphi, class_time, class_diadiem] = classInfoRes[0]?.values[0] || [];

    // ✅ Tạo dòng thông tin lớp
    const infoDiv = document.createElement("div");
    infoDiv.style.margin = "-10px 0 10px 0";
    infoDiv.style.fontWeight = "normal";
    infoDiv.style.padding = "10px";
    infoDiv.style.background = "#f1f9ff";
    infoDiv.style.border = "1px solid #ccc";
    infoDiv.style.borderRadius = "6px";
    infoDiv.style.textAlign = "center";
    infoDiv.textContent =
      `Lớp: ${class_name} - Tổng số: ${students.length} học sinh - Học phí: ${Number(class_hocphi).toLocaleString()}₫ - Thời gian: ${class_time} - Địa điểm: ${class_diadiem}`;

    // ✅ Tạo bảng
    const table = document.createElement("table");
    table.border = "1";
    table.cellPadding = "5";
    table.style.borderCollapse = "collapse";
    table.style.minWidth = "100%";
    table.style.overflowX = "auto";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["Họ và tên", "Số buổi", "Số tiền", ...allDates.map(formatDate)].forEach(title => {
      const th = document.createElement("th");
      th.textContent = title;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    for (let index = 0; index < students.length; index++) {
      const [student_id, student_name] = students[index];
      const row = document.createElement("tr");

      // ✅ Highlight học sinh vừa thu hoặc vừa bỏ qua
      if (
        window.lastDiemDanh &&
        String(window.lastDiemDanh.classId) === String(classId) &&
        String(window.lastDiemDanh.studentId) === String(student_id)
      ) {
        row.classList.add("just-updated");
        setTimeout(() => {
          row.classList.remove("just-updated");
        }, 1000);
      } else if (
        window.lastBoQua &&
        String(window.lastBoQua.classId) === String(classId) &&
        String(window.lastBoQua.studentId) === String(student_id)
      ) {
        row.classList.add("just-skipped");
        setTimeout(() => {
          row.classList.remove("just-skipped");
        }, 1000);
      }

      // ✅ Tô màu xen kẽ
      row.style.backgroundColor = index % 2 === 0 ? "#ffffff" : "#f0faff";

      // Họ và tên
      const tdName = document.createElement("td");
      tdName.textContent = student_name;
      row.appendChild(tdName);

      // Số buổi điểm danh
      const buoiRes = db.exec(`
        SELECT COUNT(*) FROM Attendance
        WHERE student_id = ${student_id} AND class_id = ${classId} AND status = 1
      `);
      const soBuoi = buoiRes[0]?.values[0][0] || 0;

      const tdBuoi = document.createElement("td");
      tdBuoi.textContent = soBuoi;
      tdBuoi.style.textAlign = "center";
      row.appendChild(tdBuoi);

      // Số tiền = số buổi x học phí
      const soTien = soBuoi * class_hocphi;
      const tdTien = document.createElement("td");
      tdTien.textContent = soTien.toLocaleString() + " ₫";
      tdTien.style.textAlign = "center";
      row.appendChild(tdTien);

      // Các cột ngày điểm danh
      for (const date of allDates) {
        const ddRes = db.exec(`
          SELECT 1 FROM Attendance
          WHERE student_id = ${student_id} AND class_id = ${classId}
          AND attendance_date = '${date}' AND status = 1
        `);
        const td = document.createElement("td");
        td.style.textAlign = "center";

        if (ddRes.length > 0) {
          td.textContent = "🟢";
        } else {
          td.textContent = "❌";
          td.style.color = "red";
        }

        // ✅ Highlight ngày vừa điểm danh (nếu có)
        if (
          window.lastDiemDanh &&
          String(window.lastDiemDanh.classId) === String(classId) &&
          String(window.lastDiemDanh.studentId) === String(student_id) &&
          window.lastDiemDanh.date === date
        ) {
          td.classList.add("just-marked");
        }

        row.appendChild(td);
      }

      tbody.appendChild(row);
    }

    table.appendChild(tbody);

    // ✅ Hiển thị bảng
    container.innerHTML = "";
    container.appendChild(infoDiv);
    container.appendChild(table);

    // ✅ Scroll đến dòng vừa tương tác
    setTimeout(() => {
      const targetRow =
        document.querySelector(`#tab-${classId} tr.just-updated`) ||
        document.querySelector(`#tab-${classId} tr.just-skipped`);
      
      if (targetRow && (window.lastDiemDanh?.active || window.lastBoQua?.active)) {
        const rect = targetRow.getBoundingClientRect();

        const scrollX = window.scrollX + rect.left + rect.width - window.innerWidth + 32;
        const scrollY = window.scrollY + rect.top + rect.height - window.innerHeight + 120;

        window.scrollTo({
          left: scrollX > 0 ? scrollX : 0,
          top: scrollY > 0 ? scrollY : 0,
          behavior: "smooth"
        });

        // ✅ Reset cả hai biến highlight
        window.lastDiemDanh = null;
        window.lastBoQua = null;
      }
    }, 100);
  } catch (err) {
    container.innerHTML = "<p style='color:red'>Lỗi hiển thị dữ liệu: " + err.message + "</p>";
  }
}






// ✅ Hàm mở/đóng submenu (cho iPhone)
function toggleSubmenu(el) {
  const li = el.parentElement;
  const openMenus = document.querySelectorAll(".has-submenu.open");

  openMenus.forEach(menu => {
    if (menu !== li) menu.classList.remove("open");
  });

  li.classList.toggle("open");
}



// Tự động đón menu con khi chạm ra ngoài
// Đóng tất cả submenu khi click ra ngoài
document.addEventListener("click", function (e) {
  const isMenuToggle = e.target.closest(".has-submenu");
  if (!isMenuToggle) {
    document.querySelectorAll(".has-submenu.open").forEach(el => {
      el.classList.remove("open");
    });
  }
});
document.addEventListener("touchstart", function (e) {
  const isMenuToggle = e.target.closest(".has-submenu");
  if (!isMenuToggle) {
    document.querySelectorAll(".has-submenu.open").forEach(el => {
      el.classList.remove("open");
    });
  }
});


function toggleSubmenu(el) {
  const li = el.closest(".has-submenu");

  // Nếu menu đang mở → đóng lại
  const isOpen = li.classList.contains("open");

  // Đóng tất cả menu khác
  document.querySelectorAll(".has-submenu.open").forEach(menu => {
    menu.classList.remove("open");
  });

  // Nếu menu đó chưa mở thì mở nó
  if (!isOpen) {
    li.classList.add("open");
  }
}

// Đóng tất cả menu khi click/chạm ra ngoài
document.addEventListener("click", function (e) {
  if (!e.target.closest(".has-submenu")) {
    document.querySelectorAll(".has-submenu.open").forEach(menu => {
      menu.classList.remove("open");
    });
  }
});

document.addEventListener("touchstart", function (e) {
  if (!e.target.closest(".has-submenu")) {
    document.querySelectorAll(".has-submenu.open").forEach(menu => {
      menu.classList.remove("open");
    });
  }
});

// Khi chọn menu con, ẩn tất cả menu cha
function onMenuAction(action) {
  // Ẩn tất cả menu con
  document.querySelectorAll(".has-submenu.open").forEach(menu => {
    menu.classList.remove("open");
  });

  // Nếu đang trên thiết bị nhỏ (mobile), ẩn luôn menu chính
  const menuBar = document.querySelector(".menu-bar");
  if (window.innerWidth <= 768 && menuBar.classList.contains("open")) {
    menuBar.classList.remove("open");
  }
}


document.addEventListener("click", function (e) {
  const clickedInsideMenu = e.target.closest(".menu-bar") || e.target.closest("#menuToggle");

  if (!clickedInsideMenu) {
    // Thu menu con
    document.querySelectorAll(".has-submenu.open").forEach(menu => {
      menu.classList.remove("open");
    });

    // Nếu đang trên thiết bị nhỏ → ẩn luôn menu chính
    const menuBar = document.querySelector(".menu-bar");
    if (window.innerWidth <= 768 && menuBar.classList.contains("open")) {
      menuBar.classList.remove("open");
    }
  }
});

document.addEventListener("touchstart", function (e) {
  const touchedInsideMenu = e.target.closest(".menu-bar") || e.target.closest("#menuToggle");

  if (!touchedInsideMenu) {
    // Thu menu con
    document.querySelectorAll(".has-submenu.open").forEach(menu => {
      menu.classList.remove("open");
    });

    // Ẩn menu chính nếu đang mở trên thiết bị nhỏ
    const menuBar = document.querySelector(".menu-bar");
    if (window.innerWidth <= 768 && menuBar.classList.contains("open")) {
      menuBar.classList.remove("open");
    }
  }
});



// Form Điểm danh
function handleChi() {
  onMenuAction();
  document.getElementById("chiModal").style.display = "flex";

  // Tự động chọn hôm nay
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("dd-date").value = today;

  // Tải danh sách lớp vào select
  const classSelect = document.getElementById("dd-class");
  classSelect.innerHTML = "";

  const result = db.exec(`SELECT class_id, class_name FROM Classes`);
  const allClasses = result[0].values;

  // Tìm class_id đang được chọn trong tabs
  const activeTab = document.querySelector(".tab-button.active");
  const activeClassId = activeTab ? activeTab.dataset.classId : null;

  allClasses.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;

    // ✅ Tự động chọn lớp đang được chọn ở tab
    if (id == activeClassId) {
      opt.selected = true;
    }

    classSelect.appendChild(opt);
  });

  loadStudentsForClass(); // Load học sinh theo lớp vừa chọn
}


function closeDiemDanh() {
  document.getElementById("chiModal").style.display = "none";
}

function loadStudentsForClass() {
  const classId = document.getElementById("dd-class").value;

  // 🔄 Tự động chuyển sang tab lớp tương ứng
  if (classId) switchTab(classId);

  const hsSelect = document.getElementById("dd-student");
  hsSelect.innerHTML = "";

  const result = db.exec(`
    SELECT student_id, student_name FROM Students 
    WHERE class_id = ${classId}
  `);

  if (result.length > 0) {
    result[0].values.forEach(([id, name]) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = name;
      hsSelect.appendChild(option);
    });
  }
}


function submitDiemDanh(status) {
  const classId = document.getElementById("dd-class").value;
  const studentSelect = document.getElementById("dd-student");
  const studentId = studentSelect.value;
  const date = document.getElementById("dd-date").value;

  // Xoá bản ghi cũ nếu có
  const check = db.exec(`
    SELECT * FROM Attendance
    WHERE class_id = ${classId} AND student_id = ${studentId} AND attendance_date = '${date}'
  `);
  if (check.length > 0) {
    db.run(`
      DELETE FROM Attendance
      WHERE class_id = ${classId} AND student_id = ${studentId} AND attendance_date = '${date}'
    `);
  }

  // Chỉ thêm mới nếu không phải hủy
  if (status === 0 || status === 1) {
    db.run(`
      INSERT INTO Attendance (class_id, student_id, attendance_date, status)
      VALUES (${classId}, ${studentId}, '${date}', ${status})
    `);
  }
 // ✅ Lưu lại thay đổi
  saveToLocal();

  // Ghi nhớ thông tin để scroll đến
  window.lastDiemDanh = {
    classId,
    studentId,
    date,
    active: true // 🟢 Đánh dấu là điểm danh
  };


  // ✅ Cập nhật bảng ngay sau mỗi điểm danh
  showClassData(classId);

  // ✅ Cập nhật thống kê thu học phí
  updateThuHocPhiThongKe(classId);

  // ✅ Chuyển sang học sinh tiếp theo hoặc kết thúc
  const nextIndex = studentSelect.selectedIndex + 1;
  if (nextIndex < studentSelect.options.length) {
    studentSelect.selectedIndex = nextIndex;
  } else {
    // ✅ Cập nhật bảng rồi mới thông báo
    setTimeout(() => {
      showToast("✅ Đã điểm danh xong", '', true); // true = căn giữa
      closeDiemDanh();
    }, 10);
  }
}


// Thêm lớp
function handleThemTour() {
  onMenuAction();
  document.getElementById("themTourModal").style.display = "flex";
  document.getElementById("lop-ten").value = "";
  document.getElementById("lop-hocphi").value = "";
  document.getElementById("lop-ngay").value = new Date().toISOString().split("T")[0];
  document.getElementById("lop-thoigian").value = "";
  document.getElementById("lop-diadiem").value = "";

  // ✅ Reset checkbox và combobox copy lớp
  const checkbox = document.getElementById("lop-copy-checkbox");
  const select = document.getElementById("lop-copy-select");
  checkbox.checked = false;
  select.disabled = true;
  select.innerHTML = '<option value="">-- Chọn lớp để sao chép --</option>';

  // ✅ Nạp danh sách lớp vào select
  const result = db.exec(`SELECT class_id, class_name FROM Classes`);
  result[0]?.values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    select.appendChild(opt);
  });
}



function closeThemLop() {
  document.getElementById("themTourModal").style.display = "none";
}

// Check box Copy danh sách lớp
function toggleCopyFromClass() {
  const checkbox = document.getElementById("lop-copy-checkbox");
  const select = document.getElementById("lop-copy-select");
  select.disabled = !checkbox.checked;
}


function submitThemLop() {
  const tenRaw = document.getElementById("lop-ten").value.trim();
  const ten = capitalizeWords(tenRaw);
  const ngay = document.getElementById("lop-ngay").value;
  const hocphiValue = document.getElementById("lop-hocphi").value.trim();
  const hocphi = parseInt(hocphiValue);
  const thoigian = document.getElementById("lop-thoigian").value.trim();
  const diadiem = document.getElementById("lop-diadiem").value.trim();

  let messages = [];
  if (!ten) messages.push("Tên lớp");
  if (!hocphiValue || isNaN(hocphi)) messages.push("Học phí");

  if (messages.length > 0) {
    alert("Hãy nhập: " + messages.join(" và "));
    return;
  }

  // ✅ Thêm lớp vào DB
  db.run(`
    INSERT INTO Classes (class_name, class_date_start, class_hocphi, class_time, class_diadiem)
    VALUES (?, ?, ?, ?, ?)
  `, [ten, ngay, hocphi, thoigian, diadiem]);

  // ✅ Lấy ID lớp vừa thêm (chính xác nhất)
  const newClassId = db.exec(`SELECT last_insert_rowid()`)[0].values[0][0];

  // ✅ Nếu người dùng chọn sao chép học sinh từ lớp khác
  const checkbox = document.getElementById("lop-copy-checkbox");
  const sourceClassId = document.getElementById("lop-copy-select").value;

  if (checkbox.checked && sourceClassId) {
    const students = db.exec(`
      SELECT student_name FROM Students WHERE class_id = ${sourceClassId}
    `);
    students[0]?.values.forEach(([name]) => {
      db.run(`INSERT INTO Students (student_name, class_id) VALUES (?, ?)`, [name, newClassId]);
    });
  }

  saveToLocal();
  closeThemLop();
  loadTour(newClassId);

  // ✅ Không cần switchTab nữa — tab đã active sẵn trong loadTour()
  // ✅ Gọi checkIfNoStudents thủ công với delay nhỏ
  setTimeout(() => {
    checkIfNoStudents(newClassId);
  }, 100);


}





// Sửa lớp
function handleSuaTour() {
  onMenuAction();
  document.getElementById("suaTourModal").style.display = "flex";

  const classSelect = document.getElementById("edit-class-select");
  classSelect.innerHTML = "";

  const result = db.exec(`SELECT class_id, class_name FROM Classes`);
  const allClasses = result[0].values;

  const activeTab = document.querySelector(".tab-button.active");
  const activeClassId = activeTab ? activeTab.dataset.classId : null;

  allClasses.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    if (id == activeClassId) opt.selected = true;
    classSelect.appendChild(opt);
  });

  loadLopInfoToForm();
}

function closeSuaLop() {
  document.getElementById("suaTourModal").style.display = "none";
}

function loadLopInfoToForm() {
  const classId = document.getElementById("edit-class-select").value;
  const result = db.exec(`
    SELECT class_name, class_date_start, class_hocphi, class_time, class_diadiem
    FROM Classes WHERE class_id = ${classId}
  `);

  if (result.length === 0) return;

  const [ten, ngay, hocphi, thoigian, diadiem] = result[0].values[0];

  document.getElementById("edit-ten").value = ten;
  document.getElementById("edit-ngay").value = ngay;
  document.getElementById("edit-hocphi").value = hocphi;
  document.getElementById("edit-thoigian").value = thoigian;
  document.getElementById("edit-diadiem").value = diadiem;
    // ✅ Chọn tab tương ứng khi chọn lớp
  switchTab(classId);
}

function submitSuaLop() {
  const classId = document.getElementById("edit-class-select").value;
  const rawTen = document.getElementById("edit-ten").value.trim();
  const ten = capitalizeWords(rawTen);
  const ngay = document.getElementById("edit-ngay").value;
  const hocphi = parseInt(document.getElementById("edit-hocphi").value) || 0;
  const thoigian = document.getElementById("edit-thoigian").value.trim();
  const diadiem = document.getElementById("edit-diadiem").value.trim();

  if (!ten || !ngay) {
    alert("Hãy nhập đầy đủ Tên lớp và Ngày bắt đầu.");
    return;
  }

  db.run(`
    UPDATE Classes
    SET class_name = ?, class_date_start = ?, class_hocphi = ?, class_time = ?, class_diadiem = ?
    WHERE class_id = ?
  `, [ten, ngay, hocphi, thoigian, diadiem, classId]);

  saveToLocal();
  closeSuaLop();

  // ✅ Load lại danh sách lớp và chọn đúng lớp vừa sửa
  loadTour(classId);
}


// Xóa lớp
function handleXoaTour() {
  onMenuAction();
  document.getElementById("xoaTourModal").style.display = "flex";

  const select = document.getElementById("xoa-class-select");
  select.innerHTML = "";

  const result = db.exec(`SELECT class_id, class_name FROM Classes`);
  const activeTab = document.querySelector(".tab-button.active");
  const activeClassId = activeTab ? activeTab.dataset.classId : null;

  let selectedClassId = null;

  result[0].values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    if (id == activeClassId) {
      opt.selected = true;
      selectedClassId = id;
    }
    select.appendChild(opt);
  });

  // ✅ Chuyển tab lớp tương ứng
  if (selectedClassId) {
    switchTab(selectedClassId);
  }
}

function closeXoaLop() {
  document.getElementById("xoaTourModal").style.display = "none";
}

function submitXoaLop() {
  const classId = document.getElementById("xoa-class-select").value;

  // Xoá lớp và dữ liệu liên quan
  db.run(`DELETE FROM Classes WHERE class_id = ?`, [classId]);
  db.run(`DELETE FROM Students WHERE class_id = ?`, [classId]);
  db.run(`DELETE FROM Attendance WHERE class_id = ?`, [classId]);

  saveToLocal();
  closeXoaLop();
  loadTour(); // Không truyền classId vì lớp đã bị xoá
  checkIfNoClasses();
}

// Viết hoa chữ cái đầu trong tên học sinh
  function capitalizeWords(str) {
    return str
      .toLocaleLowerCase('vi-VN')
      .split(' ')
      .filter(word => word) // bỏ khoảng trắng thừa
      .map(word => word.charAt(0).toLocaleUpperCase('vi-VN') + word.slice(1))
      .join(' ');
  }




// Thêm học sinh
function handleThemTv() {
  document.getElementById("themTvModal").style.display = "flex";

  const select = document.getElementById("hs-class-select");
  select.innerHTML = "";

  const result = db.exec(`SELECT class_id, class_name FROM Classes`);
  const activeTab = document.querySelector(".tab-button.active");
  const activeClassId = activeTab ? activeTab.dataset.classId : null;

  result[0].values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    if (id == activeClassId) opt.selected = true; // ✅ Đặt lớp đang chọn
    select.appendChild(opt);
  });

  const tenInput = document.getElementById("hs-ten");
  tenInput.value = "";
  setTimeout(() => tenInput.focus(), 10);

  // ✅ Gọi để hiển thị đúng lớp nếu cần
  if (activeClassId) {
    switchTab(activeClassId);
  }
}



function closeThemHs() {
  document.getElementById("themTvModal").style.display = "none";
}

function submitThemHs() {
  const classId = document.getElementById("hs-class-select").value;
  const tenInput = document.getElementById("hs-ten");
  const tenRaw = tenInput.value.trim();
  const ten = capitalizeWords(tenRaw);


  if (!ten) {
    alert("Hãy nhập họ và tên học sinh.");
    return;
  }

  // Thêm học sinh
  db.run(`
    INSERT INTO Students (student_name, class_id)
    VALUES (?, ?)
  `, [ten, classId]);

  saveToLocal();
  loadTour(classId); // cập nhật tab đang mở nếu cần

  // ✅ Không đóng form — mà reset trường tên
  tenInput.value = ""; // ✅ xoá nội dung
  tenInput.focus();    // ✅ đặt lại con trỏ
}



// Sửa học sinh
function handleSuaTv() {
  onMenuAction();
  document.getElementById("suaTvModal").style.display = "flex";

  const classSelect = document.getElementById("edit-hs-class");
  classSelect.innerHTML = "";

  const result = db.exec(`SELECT class_id, class_name FROM Classes`);
  const activeTab = document.querySelector(".tab-button.active");
  const activeClassId = activeTab ? activeTab.dataset.classId : null;

  result[0].values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    if (id == activeClassId) opt.selected = true;
    classSelect.appendChild(opt);
  });

  // ✅ Load lại danh sách lớp trước để tab chắc chắn tồn tại
  const selectedClassId = classSelect.value;
  loadTour(selectedClassId);

  setTimeout(() => {
    loadStudentsForEdit();
  }, 50); // delay nhỏ để tabs được tạo
}


function closeSuaHs() {
  document.getElementById("suaTvModal").style.display = "none";
}

function loadStudentsForEdit() {
  const classId = document.getElementById("edit-hs-class").value;
  const studentSelect = document.getElementById("edit-hs-select");
  studentSelect.innerHTML = "";

  const result = db.exec(`SELECT student_id, student_name FROM Students WHERE class_id = ${classId}`);
  result[0].values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    studentSelect.appendChild(opt);
  });

  fillOldStudentName(); // tự động điền tên hiện tại vào ô sửa
  // ✅ Đảm bảo tab đã được tạo rồi mới nhảy
  setTimeout(() => {
    if (document.querySelector(`.tab-button[data-class-id="${classId}"]`)) {
      switchTab(classId);
    }
  }, 0);
}

function fillOldStudentName() {
  const studentSelect = document.getElementById("edit-hs-select");
  const selectedOption = studentSelect.options[studentSelect.selectedIndex];
  document.getElementById("edit-hs-name").value = selectedOption ? selectedOption.textContent : "";
}

function submitSuaHs() {
  const studentId = document.getElementById("edit-hs-select").value;
  const rawName = document.getElementById("edit-hs-name").value.trim();
  const newName = capitalizeWords(rawName);
  const classId = document.getElementById("edit-hs-class").value;

  if (!newName) {
    alert("Hãy nhập tên mới.");
    return;
  }

  db.run(`UPDATE Students SET student_name = ? WHERE student_id = ?`, [newName, studentId]);

  saveToLocal();
  closeSuaHs();
  loadTour(classId); // cập nhật lại tab lớp nếu đang mở
}


// XÓa học sinh
function handleXoaTv() {
  onMenuAction();
  document.getElementById("xoaTvModal").style.display = "flex";

  const classSelect = document.getElementById("xoa-hs-class");
  classSelect.innerHTML = "";

  const result = db.exec(`SELECT class_id, class_name FROM Classes`);
  const activeTab = document.querySelector(".tab-button.active");
  const activeClassId = activeTab ? activeTab.dataset.classId : null;

  result[0].values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    if (id == activeClassId) opt.selected = true;
    classSelect.appendChild(opt);
  });

  // 🛠 Thay đổi: luôn load tab và danh sách lại
  const selectedClassId = classSelect.value;
  loadTour(selectedClassId);  // <- Đảm bảo tab được tạo

  setTimeout(() => {
    loadStudentsForXoa();
  }, 50); // delay nhỏ để chờ DOM render tabs
}


function closeXoaHs() {
  document.getElementById("xoaTvModal").style.display = "none";
}

function loadStudentsForXoa() {
  const classId = document.getElementById("xoa-hs-class").value;
  const studentSelect = document.getElementById("xoa-hs-select");
  studentSelect.innerHTML = "";

  const result = db.exec(`SELECT student_id, student_name FROM Students WHERE class_id = ${classId}`);
  result[0].values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    studentSelect.appendChild(opt);
  });
  // ✅ Đảm bảo tab lớp nhảy đúng kể cả khi không có học sinh
  setTimeout(() => {
    if (document.querySelector(`.tab-button[data-class-id="${classId}"]`)) {
      switchTab(classId);
    }
  }, 0);
}

function submitXoaHs() {
  const studentId = document.getElementById("xoa-hs-select").value;
  const classId = document.getElementById("xoa-hs-class").value;

  // Xoá học sinh và dữ liệu liên quan
  db.run(`DELETE FROM Students WHERE student_id = ?`, [studentId]);
  db.run(`DELETE FROM Attendance WHERE student_id = ?`, [studentId]);
  db.run(`DELETE FROM Thuhocphi WHERE student_id = ?`, [studentId]);

  saveToLocal();
  closeXoaHs();
  loadTour(classId); // cập nhật lại tab nếu cần
}


// Sửa ngày điểm danh
function handleSuaNgay() {
  onMenuAction();
  document.getElementById("suaNgayModal").style.display = "flex";

  const select = document.getElementById("sua-ngay-class");
  select.innerHTML = "";

  const result = db.exec(`SELECT class_id, class_name FROM Classes`);
  const activeTab = document.querySelector(".tab-button.active");
  const activeClassId = activeTab ? activeTab.dataset.classId : null;

  result[0].values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    if (id == activeClassId) opt.selected = true;
    select.appendChild(opt);
  });

  loadDatesForClass();
}

function closeSuaNgay() {
  document.getElementById("suaNgayModal").style.display = "none";
}

function loadDatesForClass() {
  const classId = document.getElementById("sua-ngay-class").value;
  const select = document.getElementById("sua-ngay-cu");
  select.innerHTML = "";

  const result = db.exec(`
    SELECT DISTINCT substr(attendance_date, 1, 10)
    FROM Attendance
    WHERE class_id = ${classId}
    ORDER BY attendance_date ASC
  `);

  result[0]?.values.forEach(([date]) => {
    const opt = document.createElement("option");
    opt.value = date;
    opt.textContent = formatDate(date); // dd-mm-yy
    select.appendChild(opt);
  });

  // ✅ Chọn tab tương ứng khi chọn lớp
  switchTab(classId);
}


function submitSuaNgay() {
  const classId = document.getElementById("sua-ngay-class").value;
  const oldDate = document.getElementById("sua-ngay-cu").value;
  const newDate = document.getElementById("sua-ngay-moi").value;

  if (!oldDate || !newDate) {
    alert("Hãy chọn đủ ngày cũ và ngày mới.");
    return;
  }

  db.run(`
    UPDATE Attendance
    SET attendance_date = ?
    WHERE class_id = ? AND substr(attendance_date, 1, 10) = ?
  `, [newDate, classId, oldDate]);

  saveToLocal();
  closeSuaNgay();
  loadTour(classId);
}

function submitXoaNgay() {
  const classId = document.getElementById("sua-ngay-class").value;
  const date = document.getElementById("sua-ngay-cu").value;

  if (!date) {
    alert("Hãy chọn ngày cần xoá.");
    return;
  }

  if (!confirm("Bạn có chắc muốn xoá toàn bộ điểm danh ngày này?")) return;

  db.run(`
    DELETE FROM Attendance
    WHERE class_id = ? AND substr(attendance_date, 1, 10) = ?
  `, [classId, date]);

  saveToLocal();
  closeSuaNgay();
  loadTour(classId);
}

// Nhảy tab lớp theo lớp chọn trên Form
function onChangeClassInThemHs() {
  const classId = document.getElementById("hs-class-select").value;
  switchTab(classId);
}





// Mở form Thu học phí
let pendingStudents = []; // Danh sách học sinh chưa thu
let currentIndex = 0;     // Vị trí hiện tại trong danh sách


function handleThu() {
  onMenuAction();
  document.getElementById("thuModal").style.display = "flex";

  const classSelect = document.getElementById("thu-class");
  classSelect.innerHTML = "";

  const result = db.exec(`SELECT class_id, class_name FROM Classes`);
  const activeClassId = document.querySelector(".tab-button.active")?.dataset.classId;

  result[0].values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    if (id == activeClassId) opt.selected = true;
    classSelect.appendChild(opt);
  });

  onChangeClassInThu(); // Gọi khi mở lần đầu
}

function closeThuHocPhi() {
  document.getElementById("thuModal").style.display = "none";
}

function onChangeClassInThu() {
  const classId = document.getElementById("thu-class").value;
  switchTab(classId);

  const studentSelect = document.getElementById("thu-student");
  studentSelect.innerHTML = "";

  // Lấy học sinh chưa thu học phí
  const result = db.exec(`
    SELECT student_id, student_name FROM Students
    WHERE class_id = ${classId} AND noptien = 0
  `);

  pendingStudents = result[0]?.values || [];
  currentIndex = 0;

  if (pendingStudents.length === 0) {
    studentSelect.innerHTML = '<option disabled selected>🎉 Tất cả học sinh đã thu</option>';
    document.getElementById("thu-money").value = "";
    return;
  }

  // Tạo danh sách chọn
  pendingStudents.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    studentSelect.appendChild(opt);
  });

  // Chọn người đầu tiên
  studentSelect.value = pendingStudents[0][0];
  updateTienThuHocPhi();
}



function updateTienThuHocPhi() {
  const classId = document.getElementById("thu-class").value;
  const studentId = document.getElementById("thu-student").value;

  // Lấy học phí lớp
  const hocphiRes = db.exec(`SELECT class_hocphi FROM Classes WHERE class_id = ${classId}`);
  const hocphi = hocphiRes[0]?.values[0][0] || 0;

  // Đếm số buổi đã điểm danh
  const buoiRes = db.exec(`
    SELECT COUNT(*) FROM Attendance
    WHERE class_id = ${classId} AND student_id = ${studentId} AND status = 1
  `);
  const sobuoi = buoiRes[0]?.values[0][0] || 0;
  const sotien = sobuoi * hocphi;

  document.getElementById("thu-money").value = sotien.toLocaleString() + " ₫";
}

function submitThuHocPhi() {
  const classId = document.getElementById("thu-class").value;

  if (pendingStudents.length === 0) {
    checkThuHocPhiHoanTat(classId);
    return;
  }

  const [studentId, studentName] = pendingStudents[currentIndex];
  const className = document.getElementById("thu-class").selectedOptions[0].textContent;

  const hocphi = db.exec(`SELECT class_hocphi FROM Classes WHERE class_id = ${classId}`)?.[0]?.values[0][0] || 0;
  const sobuoi = db.exec(`
    SELECT COUNT(*) FROM Attendance
    WHERE class_id = ${classId} AND student_id = ${studentId} AND status = 1
  `)?.[0]?.values[0][0] || 0;
  const money = sobuoi * hocphi;

  db.run(`UPDATE Students SET noptien = 1 WHERE student_id = ?`, [studentId]);
  const date = new Date().toISOString().split("T")[0];
  db.run(`
    INSERT INTO Thuhocphi (Thuhocphi_date, Thuhocphi_money, class_name, student_name, student_id)
    VALUES (?, ?, ?, ?, ?)
  `, [date, money, className, studentName, studentId]);

  saveToLocal();

  window.lastDiemDanh = { classId, studentId, active: true };

  setTimeout(() => {
    loadTour(classId);
    updateThuHocPhiThongKe(classId);
  }, 30);

  currentIndex++;
  if (currentIndex >= pendingStudents.length) {
    setTimeout(() => {
      checkThuHocPhiHoanTat(classId);
    }, 100);
    return;
  }

  const nextStudent = pendingStudents[currentIndex];
  document.getElementById("thu-student").value = nextStudent[0];
  updateTienThuHocPhi();
}



function skipThuHocPhi() {
  const classId = document.getElementById("thu-class").value;

  // ✅ Gán học sinh bị bỏ qua
  const skippedId = pendingStudents[currentIndex]?.[0];
  window.lastDiemDanh = null; // Xoá highlight vàng nếu có
  window.lastBoQua = { classId, studentId: skippedId, active: true };

  // ✅ Gọi loadTour để render lại bảng và highlight
  setTimeout(() => {
    loadTour(classId);
  }, 30);

  currentIndex++;
  if (currentIndex >= pendingStudents.length) {
    setTimeout(() => {
      checkThuHocPhiHoanTat(classId);
    }, 100);
    return;
  }

  const nextStudent = pendingStudents[currentIndex];
  document.getElementById("thu-student").value = nextStudent[0];
  updateTienThuHocPhi();
}



// Kiểm tra xem trong lớp còn học sinh nào chưa thu học phí không
function checkThuHocPhiHoanTat(classId) {
  const result = db.exec(`
    SELECT COUNT(*) FROM Students
    WHERE class_id = ${classId} AND noptien = 0
  `);
  const count = result[0]?.values?.[0]?.[0] || 0;

  if (count === 0) {
    showToast("🎉 Đã thu học phí xong.", '', true);
  } else {
    showToast("📋 Đã duyệt hết danh sách", '', true); // (vẫn còn học sinh chưa thu).
  }

  closeThuHocPhi();
}



function updateThuHocPhiThongKe(classId) {
  try {
    // Lấy học phí mỗi buổi của lớp
    const hocphiRes = db.exec(`SELECT class_hocphi FROM Classes WHERE class_id = ${classId}`);
    const hocphi = hocphiRes[0]?.values[0][0] || 0;

    // Đếm số học sinh đã thu và chưa thu
    const daThuCountRes = db.exec(`SELECT COUNT(*) FROM Students WHERE class_id = ${classId} AND noptien = 1`);
    const daThuCount = daThuCountRes[0]?.values[0][0] || 0;

    const chuaThuCountRes = db.exec(`SELECT COUNT(*) FROM Students WHERE class_id = ${classId} AND noptien = 0`);
    const chuaThuCount = chuaThuCountRes[0]?.values[0][0] || 0;

    // Tính tổng số tiền đã thu
    const daThuAmountRes = db.exec(`
      SELECT SUM(Tong_so * class_hocphi) FROM (
        SELECT student_id, COUNT(*) AS Tong_so FROM Attendance
        WHERE student_id IN (
          SELECT student_id FROM Students WHERE class_id = ${classId} AND noptien = 1
        ) AND status = 1
        GROUP BY student_id
      ) AS AttendanceSummary
      JOIN Students ON AttendanceSummary.student_id = Students.student_id
      JOIN Classes ON Students.class_id = Classes.class_id
    `);
    const tongTienDaThu = daThuAmountRes[0]?.values[0][0] || 0;

    // Tính tổng số tiền chưa thu
    const chuaThuAmountRes = db.exec(`
      SELECT SUM(Tong_so * class_hocphi) FROM (
        SELECT student_id, COUNT(*) AS Tong_so FROM Attendance
        WHERE student_id IN (
          SELECT student_id FROM Students WHERE class_id = ${classId} AND noptien = 0
        ) AND status = 1
        GROUP BY student_id
      ) AS AttendanceSummary
      JOIN Students ON AttendanceSummary.student_id = Students.student_id
      JOIN Classes ON Students.class_id = Classes.class_id
    `);
    const tongTienChuaThu = chuaThuAmountRes[0]?.values[0][0] || 0;

    // Cập nhật thống kê
    document.getElementById("count-dathu").textContent = daThuCount;
    document.getElementById("sum-dathu").textContent = tongTienDaThu.toLocaleString() + " ₫";

    document.getElementById("count-chuathu").textContent = chuaThuCount;
    document.getElementById("sum-chuathu").textContent = tongTienChuaThu.toLocaleString() + " ₫";

    // Tính phần trăm tiến độ
    const tong = tongTienDaThu + tongTienChuaThu;
    const percent = tong > 0 ? Math.round((tongTienDaThu / tong) * 100) : 0;

    // Cập nhật giao diện tiến độ
    const fill = document.getElementById("progress-bar");
    const label = document.getElementById("progress-label");
    const container = document.querySelector(".bubble-progress-container");

    fill.style.width = percent + "%";
    label.textContent = percent + "%";

    // Di chuyển label theo chiều ngang
    const containerWidth = container.offsetWidth;
    const labelX = (containerWidth * percent) / 100;
    label.style.left = labelX + "px";

    // Đổi màu nếu đủ 100%
    if (percent >= 100) {
      label.classList.add("full");
    } else {
      label.classList.remove("full");
    }

  } catch (err) {
    console.error("Lỗi thống kê thu học phí:", err.message);
  }
}



// Gán sự kiến cho 2 nút Đã Thu và Chưa Thu
const btnDaThu = document.getElementById("btn-dathu");
btnDaThu.addEventListener("click", () => {
  const classId = document.querySelector(".tab-button.active")?.dataset.classId;
  if (!classId) return;

  thuFilterState.dathu = !thuFilterState.dathu;
  thuFilterState.chuathu = false;

  btnDaThu.classList.toggle("active", thuFilterState.dathu);
  document.getElementById("btn-chuathu").classList.remove("active");

  if (thuFilterState.dathu) {
    showClassData(classId, 1);
  } else {
    showClassData(classId);
  }
});


const btnChuaThu = document.getElementById("btn-chuathu");
btnChuaThu.addEventListener("click", () => {
  const classId = document.querySelector(".tab-button.active")?.dataset.classId;
  if (!classId) return;

  thuFilterState.chuathu = !thuFilterState.chuathu;
  thuFilterState.dathu = false;

  btnChuaThu.classList.toggle("active", thuFilterState.chuathu);
  document.getElementById("btn-dathu").classList.remove("active");

  if (thuFilterState.chuathu) {
    showClassData(classId, 0);
  } else {
    showClassData(classId);
  }
});


// Đóng mở bảng chọn file .db
function openDbModal() {
  onMenuAction();
  document.getElementById("dbModal").style.display = "flex";
}

function closeDbModal() {
  document.getElementById("dbModal").style.display = "none";
}


// Hàm xuất file .db
function exportSQLite() {
  if (!db) {
    alert("⚠️ Không có dữ liệu để xuất.");
    return;
  }
  // Khai báo biến lưu lần cuối sao lưu
  const LAST_EXPORT_KEY = "lastDbExportDate"; 
  const now = new Date();  

  // Chuẩn bị dữ liệu
  const binaryArray = db.export();
  const blob = new Blob([binaryArray], { type: "application/octet-stream" });

  // Tên file theo ngày
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const fileName = `QuanLyDayThem_${dd}-${mm}-${yyyy}.db`;

  const env = detectEnvironment();

  // 🛑 Trường hợp đặc biệt: iOS PWA (không hỗ trợ tải trực tiếp)
  if (env === "ios-pwa") {
    window._modalConfirmAction = () => shareDbFileFromBlob(blob, fileName);
    openBackupModal(window._modalConfirmAction);
    return;
  }


  // ✅ Các trường hợp còn lại: tải trực tiếp
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // ✅ Thông báo tùy môi trường
  if (env === "ios-browser") {
    alert("📦 Sau khi Tải về, File được lưu trong ứng dụng Tệp");
  } else {
    showToast("📦 Đã sao lưu dữ liệu thành công", '', true);
  }
  localStorage.setItem(LAST_EXPORT_KEY, now.toISOString()); // ✅ Ghi nhận lần export
}


// Hàm phụ để lưu file .db bằng share trong PWA
async function shareDbFileFromBlob(blob, fileName) {
  const file = new File([blob], fileName, {
    type: "application/octet-stream"
  });

  const LAST_EXPORT_KEY = "lastDbExportDate"; // 🔧 THÊM DÒNG NÀY

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "Sao lưu dữ liệu",
        text: "Lưu vào Tệp hoặc chia sẻ"
      });

    // ✅ Sau khi chia sẻ thành công
    localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
    showToast("📦 Đã sao lưu dữ liệu thành công", '', true);

    } catch (err) {
      alert("❌ Bạn đã huỷ sao lưu cơ sở dữ liệu.");
      console.error("Lỗi chia sẻ:", err);
    }
  } else {
    alert("⚠️ Thiết bị không hỗ trợ chia sẻ file.\nHãy mở ứng dụng trong Safari hoặc cập nhật hệ điều hành.");
  }
}




function autoExportIfNeeded() {
  const LAST_EXPORT_KEY = "lastDbExportDate";
  const EXPORT_INTERVAL_DAYS = 15; // 15 ngày
  const lastExport = localStorage.getItem(LAST_EXPORT_KEY);
  const now = new Date();

  if (lastExport) {
    const lastDate = new Date(lastExport);
    const diffTime = now - lastDate;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    if (diffDays < EXPORT_INTERVAL_DAYS) return; // ✅ Chưa đến ngày, không export
  }

  alert(
  "🔔 Hãy tiến hành sao lưu dữ liệu định kỳ:\n\n" +
  "☰ Menu quản lý\n" +
  "  └─ 💾 Cơ sở dữ liệu\n" +
  "       └─ 📦 Sao lưu file dữ liệu"
);

}



// Tải cơ sở dữ liệu dựa theo môi trường sử dụng
// Xác định môi trường
function detectEnvironment() {
  const ua = navigator.userAgent;

  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isAndroid = /Android/.test(ua);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

  if (isIOS && isStandalone) return "ios-pwa";
  if (isIOS && !isStandalone) return "ios-browser";
  if (isAndroid && isStandalone) return "android-pwa";
  if (isAndroid && !isStandalone) return "android-browser";
  return "desktop";
}



// Hàm đóng mở Form hướng dẫn backup trong PWA
function openBackupModal(onConfirm) {
  onMenuAction();
  const modal = document.getElementById("backupModal");
  modal.style.display = "flex";
  modal.dataset.confirmCallback = onConfirm?.name || "";
  window._modalConfirmAction = onConfirm;
}

function closeBackupModal(confirmed) {
  const modal = document.getElementById("backupModal");
  modal.style.display = "none";

  if (confirmed && typeof window._modalConfirmAction === "function") {
    window._modalConfirmAction();
  }
}

// Hàm đóng Form hướng dẫn thêm vào màn hình chính
function closeAddToScreenModal(confirmed) {
  document.getElementById("addtoscreenios")?.style.setProperty("display", "none");
  document.getElementById("addtoscreenadr")?.style.setProperty("display", "none");

  isIntroClosed = true;

  // ✅ Gọi prompt nếu được bấm từ Android + người dùng xác nhận
  if (confirmed && deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      deferredPrompt = null;
    });
  }

  // ✅ Tiếp tục khởi động app (nếu có delay)
  if (window._pendingInitAfterIntro) {
    setTimeout(() => {
      window._pendingInitAfterIntro();
      window._pendingInitAfterIntro = null;
    }, 100);
  }
}

// Hàm tự động nhảy input khi nhập liệu
function enableEnterToJump(formSelector, finalButtonSelector) {
  const inputs = document.querySelectorAll(`${formSelector} input`);
  inputs.forEach((input, index) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();

        let focused = false;
        for (let i = index + 1; i < inputs.length; i++) {
          const next = inputs[i];
          if (
            !next.disabled &&
            next.type !== 'checkbox' &&
            next.type !== 'date'
          ) {
            next.focus();
            focused = true;
            break;
          }
        }

        if (!focused) {
          const saveBtn = document.querySelector(`${formSelector} ${finalButtonSelector}`);
          if (saveBtn) saveBtn.focus();
        }
      }
    });
  });
}





