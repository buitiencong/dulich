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

  if (!isStandalone && isIOS) {
    document.getElementById("addtoscreenios")?.style.setProperty("display", "flex");
  }

  if (!isStandalone && isAndroid) {
    setTimeout(() => {
      document.getElementById("addtoscreenadr")?.style.setProperty("display", "flex");
    }, 1000);
  }

  const toggleBtn = document.getElementById("menuToggle");
  const menuBar = document.querySelector(".menu-bar");

  if (toggleBtn && menuBar) {
    toggleBtn.addEventListener("click", () => {
      menuBar.classList.toggle("open");
    });
  }

  enableEnterToJump('#themTourModal', '.modal-actions button');
  enableEnterToJump('#suaTourModal', '.modal-actions button');

  // ✅ Fallback: nếu loadTour() chưa được gọi đúng, thì gọi lại
  setTimeout(() => {
    if (document.querySelectorAll(".tab-button").length === 0) {
      console.warn("⚠️ Chưa có tab nào. Gọi lại loadTour()");
      loadTour();
    }
  }, 300);
   // 🛠 THÊM DÒNG NÀY VÀO CUỐI:
  if (typeof db !== "undefined") loadTour();
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
        checkIfNoTours();
        autoExportIfNeeded();
      } else {
        window._pendingInitAfterIntro = () => {
          checkIfNoTours();
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
        checkIfNoTours();
        autoExportIfNeeded();
      } else {
        window._pendingInitAfterIntro = () => {
          checkIfNoTours();
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
    ghi_chu TEXT
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
    nguon_quy_chung BOOLEAN DEFAULT 1,
    nguoi_ung_tien_id INTEGER,
    muc_chi_id INTEGER, -- 👈 cột mới
    ghi_chu TEXT,
    FOREIGN KEY (tour_id) REFERENCES Tour(id),
    FOREIGN KEY (nguoi_ung_tien_id) REFERENCES ThanhVien(id),
    FOREIGN KEY (muc_chi_id) REFERENCES MucChi(id)
  );

  CREATE TABLE IF NOT EXISTS MucChi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ten TEXT NOT NULL UNIQUE
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

// Thêm các mục chi mặc định
const mucChiMacDinh = ["Di chuyển", "Ăn uống", "Lưu trú", "Giải trí", "Chi phí khác"];
mucChiMacDinh.forEach(ten => {
  db.run("INSERT OR IGNORE INTO MucChi (ten) VALUES (?)", [ten]);
});


  saveToLocal();         // ✅ Lưu DB mới vào localforage
// ✅ Delay nhẹ để đảm bảo dữ liệu đã vào local
  setTimeout(() => {
    loadTour();
    if (isIntroClosed) {
      checkIfNoTours();
      autoExportIfNeeded();
    } else {
      window._pendingInitAfterIntro = () => {
        checkIfNoTours();
        autoExportIfNeeded();
      };
    }
  }, 100); // ⏳ delay nhẹ 100ms
}



// Check xem có danh sách lớp nào được tạo hay chưa
function checkIfNoTours() {
  try {
    const result = db.exec("SELECT COUNT(*) FROM Tour");
    const count = result[0]?.values[0][0] || 0;
    if (count === 0) {
      // ✅ Trì hoãn 1 chút để đảm bảo alert không bị chặn trong PWA
      setTimeout(() => {
        alert("🧭 Chưa có tour nào được tạo.\n" + "      Hãy tạo tour mới để bắt đầu.");
        handleThemTour(); // 👈 mở form thêm tour sau alert
      }, 200);
    }
  } catch (err) {
    console.error("Lỗi khi kiểm tra tour:", err.message);
  }
}



// Check xem trong lớp có học sinh nào chưa
function checkIfNoThanhVien(tourId) {
  try {
    const result = db.exec(`SELECT COUNT(*) FROM ThanhVien WHERE tour_id = ${tourId}`);
    const count = result[0]?.values?.[0]?.[0] || 0;

    if (count === 0) {
      setTimeout(() => {
        alert("👥 Tour này chưa có thành viên.\n" + "      Hãy thêm thành viên vào tour.");
        setTimeout(() => handleThemThanhVien(tourId), 100); // 👈 Gọi hàm thêm thành viên với tourId
      }, 0);
    }
  } catch (err) {
    console.error("Lỗi kiểm tra thành viên:", err.message);
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



function switchTab(tourId) {
  const allTabs = document.querySelectorAll(".tab-button");
  const allContents = document.querySelectorAll(".tab-content");

  allTabs.forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tourId == tourId);
  });

  allContents.forEach(content => {
    content.classList.toggle("active", content.id === `tab-${tourId}`);
  });

  showTourData(tourId);          // ✅ Load lại dữ liệu khi chuyển tab
  updateThongKeTour(tourId);     // ✅ Nếu bạn có thống kê
}





// Bảng dữ liệu chính
function showTourData(tourId) {
  const container = document.getElementById(`tab-${tourId}`);
  container.innerHTML = ""; // Xoá nội dung cũ
  // ✅ Lấy thông tin tour
  try {
    const tourInfo = db.exec(`
      SELECT ten, dia_diem, ngay_di, ngay_ve
      FROM Tour
      WHERE id = ${tourId}
    `);

    if (tourInfo.length > 0) {
      const [ten, dia_diem, ngay_di, ngay_ve] = tourInfo[0].values[0];

      const infoDiv = document.createElement("div");
      infoDiv.style.margin = "-10px 0 10px 0";
      infoDiv.style.fontWeight = "normal";
      infoDiv.style.padding = "10px";
      infoDiv.style.background = "#f1f9ff";
      infoDiv.style.border = "1px solid #ccc";
      infoDiv.style.borderRadius = "6px";
      infoDiv.style.textAlign = "center";
      infoDiv.textContent =
        `🧳 Tour: ${ten} – Địa điểm: ${dia_diem || "…" } – Từ ${ngay_di} đến ${ngay_ve}`;

      container.appendChild(infoDiv); // ✅ Chèn vào đầu trang tour
    }
  } catch (err) {
    console.error("Lỗi lấy thông tin tour:", err.message);
  }


  // Tạo thanh tab giống Chrome/Edge
  const tabBar = document.createElement("div");
  tabBar.className = "tab-header";
  tabBar.style.display = "flex";
  tabBar.style.gap = "10px";
  tabBar.style.marginBottom = "10px";

  const tabNames = ["Thành viên", "Chi tiêu"];
  const contentSections = [];

  tabNames.forEach((name, i) => {
    const tabBtn = document.createElement("div");
    tabBtn.textContent = name;
    tabBtn.className = "inner-tab";
    tabBtn.style.padding = "8px 16px";
    tabBtn.style.border = "1px solid #ccc";
    tabBtn.style.borderBottom = "none";
    tabBtn.style.borderRadius = "6px 6px 0 0";
    tabBtn.style.cursor = "pointer";
    tabBtn.style.background = i === 0 ? "#fff" : "#e0e0e0";
    tabBtn.style.fontWeight = i === 0 ? "bold" : "normal";

    const section = document.createElement("div");
    section.style.display = i === 0 ? "block" : "none";
    section.style.border = "1px solid #ccc";
    section.style.padding = "10px";
    section.style.borderRadius = "0 0 6px 6px";
    section.style.background = "#fff";

    tabBtn.onclick = () => {
      contentSections.forEach((sec, j) => {
        sec.style.display = j === i ? "block" : "none";
        tabBar.children[j].style.background = j === i ? "#fff" : "#e0e0e0";
        tabBar.children[j].style.fontWeight = j === i ? "bold" : "normal";
      });
    };

    tabBar.appendChild(tabBtn);
    container.appendChild(section);
    contentSections.push(section);
  });

  container.prepend(tabBar);

  // ✅ Tab 1: Thành viên
  try {
    const res = db.exec(`
      SELECT id, ho_ten, sdt, ty_le_dong, ghi_chu
      FROM ThanhVien
      WHERE tour_id = ${tourId}
    `);
    const members = res[0]?.values || [];

    const dongGopMap = {};
    const gopRes = db.exec(`
      SELECT thanh_vien_id, SUM(so_tien)
      FROM DongGop
      WHERE tour_id = ${tourId}
      GROUP BY thanh_vien_id
    `);
    gopRes[0]?.values.forEach(([id, sum]) => {
      dongGopMap[id] = sum;
    });

    const table1 = document.createElement("table");
    table1.border = "1";
    table1.cellPadding = "5";
    table1.style.borderCollapse = "collapse";
    table1.style.width = "100%";

    const thead1 = document.createElement("thead");
    thead1.innerHTML = `
      <tr style="background:#f0f0f0;">
        <th>STT</th>
        <th>Họ và tên</th>
        <th>SĐT</th>
        <th>Tỉ lệ đóng</th>
        <th>Đã đóng</th>
        <th>Ghi chú</th>
      </tr>`;
    table1.appendChild(thead1);

    const tbody1 = document.createElement("tbody");
    members.forEach(([id, name, sdt, tile, note], i) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td style="text-align:center">${i + 1}</td>
        <td>${name}</td>
        <td>${sdt || ""}</td>
        <td style="text-align:center">${tile * 100}%</td>
        <td style="text-align:right">${(dongGopMap[id] || 0).toLocaleString()} ₫</td>
        <td>${note || ""}</td>
      `;
      tbody1.appendChild(row);
    });
    table1.appendChild(tbody1);
    contentSections[0].appendChild(table1);
  } catch (err) {
    contentSections[0].innerHTML = `<p style="color:red">Lỗi tải thành viên: ${err.message}</p>`;
  }

  // ✅ Tab 2: Chi tiêu
  try {
    const res = db.exec(`
      SELECT thoi_gian, ten_khoan, so_tien
      FROM ChiTieu
      WHERE tour_id = ${tourId}
      ORDER BY thoi_gian ASC
    `);
    const chiTieu = res[0]?.values || [];

    const table2 = document.createElement("table");
    table2.border = "1";
    table2.cellPadding = "5";
    table2.style.borderCollapse = "collapse";
    table2.style.width = "100%";

    const thead2 = document.createElement("thead");
    thead2.innerHTML = `
      <tr style="background:#f0f0f0;">
        <th>STT</th>
        <th>Thời gian</th>
        <th>Tên khoản chi</th>
        <th>Mục chi</th>
        <th>Số tiền</th>
      </tr>`;
    table2.appendChild(thead2);

    const tbody2 = document.createElement("tbody");
    chiTieu.forEach(([thoigian, ten, tien], i) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td style="text-align:center">${i + 1}</td>
        <td>${formatDateTime(thoigian)}</td>
        <td>${ten}</td>
        <td>–</td> <!-- Sẽ cập nhật mục chi sau -->
        <td style="text-align:right">${tien.toLocaleString()} ₫</td>
      `;
      tbody2.appendChild(row);
    });
    table2.appendChild(tbody2);
    contentSections[1].appendChild(table2);
  } catch (err) {
    contentSections[1].innerHTML = `<p style="color:red">Lỗi tải chi tiêu: ${err.message}</p>`;
  }
}

function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${d.getFullYear()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/////////////////////////






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

  loadMembersForTour(); // Load học sinh theo lớp vừa chọn
}


function closeDiemDanh() {
  document.getElementById("chiModal").style.display = "none";
}

function loadMembersForTour() {
  const tourId = document.getElementById("dd-tour").value;

  // 🔄 Tự động chuyển sang tab tour tương ứng
  if (tourId) switchTab(tourId);

  const memberSelect = document.getElementById("dd-member");
  memberSelect.innerHTML = "";

  const result = db.exec(`
    SELECT id, ho_ten FROM ThanhVien 
    WHERE tour_id = ${tourId}
  `);

  if (result.length > 0) {
    result[0].values.forEach(([id, name]) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = name;
      memberSelect.appendChild(option);
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
  showTourData(classId);

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


// Thêm Tour
function handleThemTour() {
  onMenuAction(); // 👈 Tuỳ bạn xử lý menu/ẩn hiện chung
  document.getElementById("themTourModal").style.display = "flex";

  // ✅ Reset các trường nhập
  document.getElementById("tour-ten").value = "";
  document.getElementById("tour-ngay-di").value = new Date().toISOString().split("T")[0];
  document.getElementById("tour-ngay-ve").value = new Date().toISOString().split("T")[0];
  document.getElementById("tour-diadiem").value = "";
  document.getElementById("tour-ghichu").value = "";

  // ✅ Reset checkbox và danh sách sao chép tour (nếu bạn dùng tính năng này)
  const checkbox = document.getElementById("tour-copy-checkbox");
  const select = document.getElementById("tour-copy-select");
  checkbox.checked = false;
  select.disabled = true;
  select.innerHTML = '<option value="">-- Chọn tour để sao chép --</option>';

  // ✅ Nạp danh sách tour có sẵn vào combobox (nếu dùng chức năng sao chép)
  const result = db.exec(`SELECT id, ten FROM Tour`);
  result[0]?.values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    select.appendChild(opt);
  });
}




function closeThemTour() {
  document.getElementById("themTourModal").style.display = "none";
}

// Check box Copy danh sách lớp
function toggleCopyFromClass() {
  const checkbox = document.getElementById("lop-copy-checkbox");
  const select = document.getElementById("lop-copy-select");
  select.disabled = !checkbox.checked;
}


function submitThemTour() {
  const ten = document.getElementById("tour-ten").value.trim();
  const ngayDi = document.getElementById("tour-ngay-di").value;
  const ngayVe = document.getElementById("tour-ngay-ve").value;
  const diadiem = document.getElementById("tour-diadiem").value.trim();
  const ghichu = document.getElementById("tour-ghichu").value.trim();

  let messages = [];
  if (!ten) messages.push("Tên tour");
  if (!ngayDi) messages.push("Ngày đi");
  if (!ngayVe) messages.push("Ngày về");

  if (messages.length > 0) {
    alert("Hãy nhập: " + messages.join(" và "));
    return;
  }

  // ✅ Thêm tour vào DB
  db.run(`
    INSERT INTO Tour (ten, ngay_di, ngay_ve, dia_diem, ghi_chu)
    VALUES (?, ?, ?, ?, ?)
  `, [ten, ngayDi, ngayVe, diadiem, ghichu]);

  // ✅ Lấy ID tour vừa thêm
  const newTourId = db.exec(`SELECT last_insert_rowid()`)[0].values[0][0];

  // ✅ Nếu chọn sao chép thành viên từ tour khác
  const checkbox = document.getElementById("tour-copy-checkbox");
  const sourceTourId = document.getElementById("tour-copy-select").value;

  if (checkbox.checked && sourceTourId) {
    const members = db.exec(`
      SELECT ho_ten, sdt, ty_le_dong, ghi_chu 
      FROM ThanhVien WHERE tour_id = ${sourceTourId}
    `);
    members[0]?.values.forEach(([name, sdt, tile, note]) => {
      db.run(`
        INSERT INTO ThanhVien (ho_ten, sdt, ty_le_dong, ghi_chu, tour_id)
        VALUES (?, ?, ?, ?, ?)
      `, [name, sdt, tile, note, newTourId]);
    });
  }

  saveToLocal();
  closeThemTour();
  loadTour(newTourId);

  // ✅ Gợi ý thêm thành viên nếu chưa có
  setTimeout(() => {
    checkIfNoThanhVien(newTourId);
  }, 100);
}






// Sửa Tour
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

  loadTourInfoToForm();
}

function closeSuaTour() {
  document.getElementById("suaTourModal").style.display = "none";
}

function loadTourInfoToForm() {
  const tourId = document.getElementById("edit-tour-select").value;

  const result = db.exec(`
    SELECT ten, ngay_di, ngay_ve, dia_diem, ghi_chu
    FROM Tour WHERE tour_id = ${tourId}
  `);

  if (result.length === 0) return;

  const [ten, ngayDi, ngayVe, diaDiem, ghiChu] = result[0].values[0];

  document.getElementById("edit-ten-tour").value = ten;
  document.getElementById("edit-ngay-di").value = ngayDi;
  document.getElementById("edit-ngay-ve").value = ngayVe;
  document.getElementById("edit-diadiem-tour").value = diaDiem;
  document.getElementById("edit-ghichu-tour").value = ghiChu;

  // ✅ Tự động chuyển sang tab Tour tương ứng
  switchTab(tourId);
}


function submitSuaTour() {
  const tourId = document.getElementById("edit-tour-select").value;
  const ten = document.getElementById("edit-ten-tour").value.trim();
  const ngayDi = document.getElementById("edit-ngay-di").value;
  const ngayVe = document.getElementById("edit-ngay-ve").value;
  const diaDiem = document.getElementById("edit-diadiem-tour").value.trim();
  const ghiChu = document.getElementById("edit-ghichu-tour").value.trim();

  if (!ten || !ngayDi || !ngayVe) {
    alert("Hãy nhập đầy đủ Tên tour, Ngày đi và Ngày về.");
    return;
  }

  db.run(`
    UPDATE Tour
    SET ten = ?, ngay_di = ?, ngay_ve = ?, dia_diem = ?, ghi_chu = ?
    WHERE tour_id = ?
  `, [ten, ngayDi, ngayVe, diaDiem, ghiChu, tourId]);

  saveToLocal();
  closeSuaTour();

  // ✅ Load lại danh sách tour và chọn đúng tour vừa sửa
  loadTour(tourId);
}



function handleXoaTour() {
  onMenuAction(); // 👈 Giữ nguyên nếu bạn có menu cần đóng
  document.getElementById("xoaTourModal").style.display = "flex";

  const select = document.getElementById("xoa-tour-select");
  select.innerHTML = "";

  const result = db.exec(`SELECT tour_id, ten FROM Tour`);
  const activeTab = document.querySelector(".tab-button.active");
  const activeTourId = activeTab ? activeTab.dataset.classId : null;

  let selectedTourId = null;

  result[0].values.forEach(([id, ten]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = ten;
    if (id == activeTourId) {
      opt.selected = true;
      selectedTourId = id;
    }
    select.appendChild(opt);
  });

  // ✅ Chuyển tab tour tương ứng
  if (selectedTourId) {
    switchTab(selectedTourId);
  }
}


function closeXoaTour() {
  document.getElementById("xoaTourModal").style.display = "none";
}

function submitXoaTour() {
  const tourId = document.getElementById("xoa-tour-select").value;

  // ❗Xoá Tour và dữ liệu liên quan
  db.run(`DELETE FROM Tour WHERE tour_id = ?`, [tourId]);
  db.run(`DELETE FROM ThanhVien WHERE tour_id = ?`, [tourId]);
  db.run(`DELETE FROM ChiTieu WHERE tour_id = ?`, [tourId]);
  db.run(`DELETE FROM ThuTien WHERE tour_id = ?`, [tourId]);

  saveToLocal();
  closeXoaTour();
  loadTour(); // Không truyền tourId vì tour đã bị xoá
  checkIfNoTours();
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




// Thêm thành viên
function handleThemThanhVien() {
  document.getElementById("themTvModal").style.display = "flex";

  const select = document.getElementById("tv-tour-select");
  select.innerHTML = "";

  const result = db.exec(`SELECT tour_id, ten FROM Tour`);
  const activeTab = document.querySelector(".tab-button.active");
  const activeTourId = activeTab ? activeTab.dataset.classId : null;

  result[0].values.forEach(([id, ten]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = ten;
    if (id == activeTourId) opt.selected = true; // ✅ Chọn tour đang active
    select.appendChild(opt);
  });

  // Reset các trường nhập
  document.getElementById("tv-ten").value = "";
  document.getElementById("tv-sdt").value = "";
  document.getElementById("tv-tyle").value = "100";
  document.getElementById("tv-ghichu").value = "";

  // Tự động focus vào ô tên
  setTimeout(() => document.getElementById("tv-ten").focus(), 10);

  // ✅ Đảm bảo tab tour được chọn vẫn hiển thị
  if (activeTourId) {
    switchTab(activeTourId);
  }
}




function closeThemThanhvien() {
  document.getElementById("themTvModal").style.display = "none";
}

function submitThemThanhVien() {
  const tourId = document.getElementById("tv-tour-select").value;
  const tenInput = document.getElementById("tv-ten");
  const sdtInput = document.getElementById("tv-sdt");
  const tyleInput = document.getElementById("tv-tyle");
  const ghichuInput = document.getElementById("tv-ghichu");

  const tenRaw = tenInput.value.trim();
  const ten = capitalizeWords(tenRaw);
  const sdt = sdtInput.value.trim();
  const tyle = parseInt(tyleInput.value);
  const ghichu = ghichuInput.value.trim();

  if (!ten) {
    alert("Hãy nhập họ và tên thành viên.");
    return;
  }

  db.run(`
    INSERT INTO ThanhVien (tour_id, ten, sdt, tyle_dong, ghichu)
    VALUES (?, ?, ?, ?, ?)
  `, [tourId, ten, sdt, isNaN(tyle) ? 100 : tyle, ghichu]);

  saveToLocal();
  loadTour(tourId);

  // ✅ Reset form nhập để tiếp tục thêm thành viên khác
  tenInput.value = "";
  sdtInput.value = "";
  tyleInput.value = "100";
  ghichuInput.value = "";
  tenInput.focus();
}




// Sửa thành viên
function handleSuaThanhVien() {
  onMenuAction();
  document.getElementById("suaTvModal").style.display = "flex";

  const tourSelect = document.getElementById("edit-tv-tour");
  tourSelect.innerHTML = "";

  const result = db.exec(`SELECT tour_id, ten FROM Tour`);
  const activeTab = document.querySelector(".tab-button.active");
  const activeTourId = activeTab ? activeTab.dataset.classId : null;

  result[0].values.forEach(([id, ten]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = ten;
    if (id == activeTourId) opt.selected = true;
    tourSelect.appendChild(opt);
  });

  // ✅ Load lại danh sách tour để tab chắc chắn tồn tại
  const selectedTourId = tourSelect.value;
  loadTour(selectedTourId);

  setTimeout(() => {
    loadThanhVienForEdit(); // 👈 bạn cần có hàm này để load danh sách thành viên
  }, 50);
}



function closeSuaThanhvien() {
  document.getElementById("suaTvModal").style.display = "none";
}

function loadThanhVienForEdit() {
  const tourId = document.getElementById("edit-tv-tour").value;
  const tvSelect = document.getElementById("edit-tv-select");
  tvSelect.innerHTML = "";

  const result = db.exec(`SELECT tv_id, ten FROM ThanhVien WHERE tour_id = ${tourId}`);
  result[0]?.values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    tvSelect.appendChild(opt);
  });

  fillOldThanhVienInfo(); // 👈 tự động điền thông tin vào form sửa

  // ✅ Nhảy sang tab tương ứng (nếu tab tour đã có)
  setTimeout(() => {
    if (document.querySelector(`.tab-button[data-class-id="${tourId}"]`)) {
      switchTab(tourId);
    }
  }, 0);
}


function fillOldThanhVienInfo() {
  const tvSelect = document.getElementById("edit-tv-select");
  const selectedId = tvSelect.value;

  if (!selectedId) return;

  const result = db.exec(`
    SELECT ten, sdt, tyle_dong, ghichu
    FROM ThanhVien
    WHERE tv_id = ${selectedId}
  `);

  const [ten, sdt, tyle, ghichu] = result[0]?.values[0] || [];

  document.getElementById("edit-tv-name").value = ten || "";
  document.getElementById("edit-tv-sdt").value = sdt || "";
  document.getElementById("edit-tv-tyle").value = tyle || "100";
  document.getElementById("edit-tv-ghichu").value = ghichu || "";
}


function submitSuaThanhVien() {
  const tvId = document.getElementById("edit-tv-select").value;
  const rawName = document.getElementById("edit-tv-name").value.trim();
  const newName = capitalizeWords(rawName);
  const sdt = document.getElementById("edit-tv-sdt").value.trim();
  const tyle = parseInt(document.getElementById("edit-tv-tyle").value.trim()) || 100;
  const ghichu = document.getElementById("edit-tv-ghichu").value.trim();
  const tourId = document.getElementById("edit-tv-tour").value;

  if (!newName) {
    alert("Hãy nhập họ và tên mới.");
    return;
  }

  db.run(`
    UPDATE ThanhVien
    SET ten = ?, sdt = ?, tyle_dong = ?, ghichu = ?
    WHERE tv_id = ?
  `, [newName, sdt, tyle, ghichu, tvId]);

  saveToLocal();
  closeSuaThanhvien();
  loadTour(tourId); // Cập nhật lại tab tour đang mở
}



function handleXoaThanhVien() {
  onMenuAction();
  document.getElementById("xoaTvModal").style.display = "flex";

  const tourSelect = document.getElementById("xoa-tv-tour");
  tourSelect.innerHTML = "";

  const result = db.exec(`SELECT tour_id, ten FROM Tour`);
  const activeTab = document.querySelector(".tab-button.active");
  const activeTourId = activeTab ? activeTab.dataset.classId : null;

  result[0].values.forEach(([id, ten]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = ten;
    if (id == activeTourId) opt.selected = true;
    tourSelect.appendChild(opt);
  });

  const selectedTourId = tourSelect.value;
  loadTour(selectedTourId); // đảm bảo tab đang mở đúng

  setTimeout(() => {
    loadThanhVienForXoa();
  }, 50);
}



function closeXoaThanhvien() {
  document.getElementById("xoaTvModal").style.display = "none";
}

function loadThanhVienForXoa() {
  const tourId = document.getElementById("xoa-tv-tour").value;
  const tvSelect = document.getElementById("xoa-tv-select");
  tvSelect.innerHTML = "";

  const result = db.exec(`SELECT tv_id, ten FROM ThanhVien WHERE tour_id = ${tourId}`);
  result[0]?.values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    tvSelect.appendChild(opt);
  });

  // ✅ Nhảy sang tab tour tương ứng
  setTimeout(() => {
    if (document.querySelector(`.tab-button[data-class-id="${tourId}"]`)) {
      switchTab(tourId);
    }
  }, 0);
}


function submitXoaThanhVien() {
  const tvId = document.getElementById("xoa-tv-select").value;
  const tourId = document.getElementById("xoa-tv-tour").value;

  // ❌ Xoá thành viên khỏi bảng ThanhVien
  db.run(`DELETE FROM ThanhVien WHERE tv_id = ?`, [tvId]);

  // ❌ Xoá các khoản thu liên quan (nếu có)
  db.run(`DELETE FROM DongGop WHERE thanh_vien_id = ?`, [tvId]);

  // ❌ Xoá các khoản chi liên quan nếu người đó từng ứng tiền
  db.run(`DELETE FROM ChiTieu WHERE nguon_chi = ?`, [tvId]);

  saveToLocal();
  closeXoaThanhvien();
  loadTour(tourId); // cập nhật lại tab đang mở
}





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





