let db;
let SQL;

let deferredPrompt = null;
let isIntroClosed = false;

/** 🔸 Bước 1: Khởi tạo SQLite và DB */
initSqlJs({
  locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${file}`
}).then(SQLLib => {
  SQL = SQLLib;

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) isIntroClosed = true;

  localforage.getItem("userDB").then(buffer => {
    if (buffer instanceof Uint8Array || buffer?.length) {
      db = new SQL.Database(new Uint8Array(buffer));
    } else {
      db = new SQL.Database(); // tạo mới nếu chưa có
      initNewDatabase();       // hàm này sẽ tạo bảng mẫu
    }

    // Gửi sự kiện báo DB đã sẵn sàng
    document.dispatchEvent(new Event("sqlite-ready"));
  });
});


/** 🔸 Bước 2: Khi DOM và DB đã sẵn sàng */
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

  // Khi cả DOM và DB đã sẵn sàng thì xử lý
  document.addEventListener("sqlite-ready", () => {
    loadTour();

    //checkIfNoTours();
    if (isIntroClosed) {
      checkIfNoTours();
    } else {
      window._pendingInitAfterIntro = () => checkIfNoTours();
    }

    // Fallback nếu loadTour không thành công sau 300ms
    setTimeout(() => {
      if (document.querySelectorAll(".tab-button").length === 0) {
        console.warn("⚠️ Chưa có tab nào. Gọi lại loadTour()");
        loadTour();
      }
    }, 300);
  });
});


/** 🔸 Bước 3: Xử lý khi người dùng chọn file .db */
document.getElementById("dbfile")?.addEventListener("change", function () {
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
    checkIfNoTours();
  };

  reader.readAsArrayBuffer(file);
});


// Khởi tạo cơ sở dữ liệu
function initNewDatabase() {
  db = new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS Tour (
      tour_id INTEGER PRIMARY KEY AUTOINCREMENT,
      tour_ten TEXT NOT NULL,
      tour_dia_diem TEXT,
      tour_ngay_di DATE NOT NULL,
      tour_ngay_ve DATE NOT NULL,
      tour_mo_ta TEXT
    );

    CREATE TABLE IF NOT EXISTS ThanhVien (
      tv_id INTEGER PRIMARY KEY AUTOINCREMENT,
      tv_tour_id INTEGER,
      tv_ho_ten TEXT NOT NULL,
      tv_gioi_tinh INTEGER, -- 0: nữ, 1: nam
      tv_sdt TEXT,
      tv_ty_le_dong REAL DEFAULT 1.0,
      FOREIGN KEY (tv_tour_id) REFERENCES Tour(tour_id)
    );

    CREATE TABLE IF NOT EXISTS ChiTieu (
      ct_id INTEGER PRIMARY KEY AUTOINCREMENT,
      ct_tour_id INTEGER,
      ct_thoi_gian DATETIME NOT NULL,
      ct_ten_khoan TEXT NOT NULL,
      ct_so_tien INTEGER NOT NULL,
      ct_quy_chung BOOLEAN DEFAULT 1,
      ct_nguoi_ung_id INTEGER,
      ct_danh_muc_id INTEGER, -- 🔥 Mới thêm
      ct_ghi_chu TEXT,
      FOREIGN KEY (ct_tour_id) REFERENCES Tour(tour_id),
      FOREIGN KEY (ct_nguoi_ung_id) REFERENCES ThanhVien(tv_id),
      FOREIGN KEY (ct_danh_muc_id) REFERENCES DanhMuc(dm_id)
    );

    CREATE TABLE IF NOT EXISTS DanhMuc (
      dm_id INTEGER PRIMARY KEY AUTOINCREMENT,
      dm_ten TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS DongGop (
      dg_id INTEGER PRIMARY KEY AUTOINCREMENT,
      dg_tour_id INTEGER,
      dg_tv_id INTEGER,
      dg_so_tien INTEGER NOT NULL,
      dg_thoi_gian DATETIME NOT NULL,
      dg_ghi_chu TEXT,
      FOREIGN KEY (dg_tour_id) REFERENCES Tour(tour_id),
      FOREIGN KEY (dg_tv_id) REFERENCES ThanhVien(tv_id)
    );
  `);

  // Thêm các danh mục chi mặc định
  const mucChiMacDinh = ["Di chuyển", "Ăn uống", "Lưu trú", "Giải trí", "Chi phí khác"];
  mucChiMacDinh.forEach(ten => {
    db.run("INSERT OR IGNORE INTO DanhMuc (dm_ten) VALUES (?)", [ten]);
  });

  saveToLocal();         // ✅ Lưu DB mới vào localforage
  loadTour();            // ✅ Cập nhật UI

  window._pendingInitAfterIntro = () => checkIfNoTours();
}

// Hàm để lưu các thay đổi cơ sở dữ liệu
function saveToLocal() {
  if (db) {
    const data = db.export();
    localforage.setItem("userDB", data);
  }
}

/**Xử lý menu */ 
// ✅ Hàm toggle submenu
function toggleSubmenu(el) {
  const li = el.closest(".has-submenu");
  const isOpen = li.classList.contains("open");

  // Đóng tất cả
  document.querySelectorAll(".has-submenu.open").forEach(menu => menu.classList.remove("open"));

  // Mở nếu chưa mở
  if (!isOpen) {
    li.classList.add("open");
  }
}

// ✅ Hàm xử lý khi chọn menu con
function onMenuAction(action) {
  closeAllMenus();
  // gọi hàm xử lý action nếu cần
}

// ✅ Hàm đóng tất cả menu
function closeAllMenus() {
  document.querySelectorAll(".has-submenu.open").forEach(menu => menu.classList.remove("open"));

  const menuBar = document.querySelector(".menu-bar");
  if (window.innerWidth <= 768 && menuBar.classList.contains("open")) {
    menuBar.classList.remove("open");
  }
}

// ✅ Sự kiện click/touch ngoài menu → đóng tất cả
["click", "touchstart"].forEach(evt =>
  document.addEventListener(evt, function (e) {
    const isInside = e.target.closest(".menu-bar") || e.target.closest("#menuToggle");
    if (!isInside) closeAllMenus();
  })
);


// Kiểm tra xem có Tour nào được tạo chưa
function checkIfNoTours() {
  try {
    const result = db.exec("SELECT COUNT(*) FROM Tour");
    const count = result[0]?.values[0][0] || 0;

    if (count === 0) {
      // Nếu intro chưa đóng thì chờ rồi gọi lại sau
      if (!isIntroClosed) {
        window._pendingInitAfterIntro = () => checkIfNoTours();
        return;
      }

      // Chỉ hiển thị sau khi intro đã đóng
      setTimeout(() => {
        showToast("🧭 Chưa có tour nào được tạo.<br>Hãy tạo tour mới để bắt đầu.", '', true);
        handleThemTour();
      }, 300);
    }
  } catch (err) {
    console.error("Lỗi khi kiểm tra tour:", err.message);
  }
}


// Load danh sách Tour vào Tab
function loadTour(selectedTourId = null) {
  const tabs = document.getElementById("tabs");
  const contents = document.getElementById("tabContents");
  tabs.innerHTML = "";
  contents.innerHTML = "";

  let tours;
  try {
    // Dùng đúng tên cột mới trong CSDL
    tours = db.exec("SELECT tour_id, tour_ten FROM Tour ORDER BY tour_ngay_di DESC");
  } catch (err) {
    tabs.innerHTML = "<p>Lỗi: " + err.message + "</p>";
    return;
  }

  if (!tours.length || !tours[0]?.values?.length) {
    tabs.innerHTML = "<p>Không có tour nào.</p>";
    return;
  }

  tours[0].values.forEach(([tourId, tourTen], index) => {
    const tabBtn = document.createElement("div");
    tabBtn.className = "tab-button";
    tabBtn.textContent = tourTen;
    tabBtn.dataset.tourId = tourId;
    tabBtn.onclick = () => switchTab(tourId);  // Bạn nên đảm bảo đã có hàm này

    const isActive = selectedTourId ? tourId == selectedTourId : index === 0;
    if (isActive) tabBtn.classList.add("active");

    tabs.appendChild(tabBtn);

    const contentDiv = document.createElement("div");
    contentDiv.className = "tab-content" + (isActive ? " active" : "");
    contentDiv.id = `tab-${tourId}`;
    contents.appendChild(contentDiv);

    if (isActive) {
      // Gọi các hàm hiển thị nội dung cho tour
      if (typeof showTourData === "function") showTourData(tourId);
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
}


// Hiển thị bảng
function showTourData(tourId) {
  const container = document.getElementById(`tab-${tourId}`);
  container.innerHTML = ""; // Xoá nội dung cũ

  // ✅ Phần 1: Lấy thông tin tour
  let infoDiv = null;
  try {
    const tourInfo = db.exec(`
      SELECT tour_ten, tour_dia_diem, tour_ngay_di, tour_ngay_ve
      FROM Tour
      WHERE tour_id = ${tourId}
    `);

    if (tourInfo.length > 0) {
      const [ten, dia_diem, ngay_di, ngay_ve] = tourInfo[0].values[0];

      infoDiv = document.createElement("div");
      infoDiv.style.cssText = `
        margin: 0 0 12px 0;
        font-weight: normal;
        padding: 10px;
        background: #f1f9ff;
        border: 1px solid #ccc;
        border-radius: 6px;
        text-align: center;
      `;
      infoDiv.textContent =
        `🧳 Tour: ${ten} – Địa điểm: ${dia_diem || "…"} – Từ ${ngay_di} đến ${ngay_ve}`;
    }
  } catch (err) {
    console.error("Lỗi lấy thông tin tour:", err.message);
  }

  // ✅ Phần 2: Tạo thanh tab và nội dung tab
  const tabBar = document.createElement("div");
  tabBar.className = "tab-header";
  tabBar.style.cssText = `
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
  `;

  const tabNames = ["Thành viên", "Chi tiêu"];
  const contentSections = [];

  tabNames.forEach((name, i) => {
    const tabBtn = document.createElement("div");
    tabBtn.textContent = name;
    tabBtn.className = "inner-tab";
    tabBtn.style.cssText = `
      padding: 8px 16px;
      border: 1px solid #ccc;
      border-bottom: none;
      border-radius: 6px 6px 0 0;
      cursor: pointer;
      background: ${i === 0 ? "#fff" : "#e0e0e0"};
      font-weight: ${i === 0 ? "bold" : "normal"};
    `;

    const section = document.createElement("div");
    section.style.cssText = `
      display: ${i === 0 ? "block" : "none"};
      border: 1px solid #ccc;
      padding: 10px;
      border-radius: 0 0 6px 6px;
      background: #fff;
    `;

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

  // ✅ Chèn thông tin tour (nếu có) vào TRÊN thanh tab
  if (infoDiv) container.prepend(infoDiv);

  // ✅ Chèn tabBar ngay sau info
  container.insertBefore(tabBar, contentSections[0]);

  // ✅ Tab 1: Thành viên
  try {
    const res = db.exec(`
      SELECT tv_id, tv_ho_ten, tv_sdt, tv_ty_le_dong
      FROM ThanhVien
      WHERE tv_tour_id = ${tourId}
    `);
    const members = res[0]?.values || [];

    const dongGopMap = {};
    const gopRes = db.exec(`
      SELECT dg_tv_id, SUM(dg_so_tien)
      FROM DongGop
      WHERE dg_tour_id = ${tourId}
      GROUP BY dg_tv_id
    `);
    gopRes[0]?.values.forEach(([id, sum]) => {
      dongGopMap[id] = sum;
    });

    const table1 = document.createElement("table");
    table1.border = "1";
    table1.cellPadding = "5";
    table1.style.cssText = "border-collapse: collapse; width: 100%;";

    table1.innerHTML = `
      <thead>
        <tr style="background:#f0f0f0;">
          <th>STT</th>
          <th>Họ và tên</th>
          <th>SĐT</th>
          <th>Tỉ lệ đóng</th>
          <th>Đã đóng</th>
        </tr>
      </thead>
      <tbody>
        ${members.map(([id, name, sdt, tyle], i) => `
          <tr>
            <td style="text-align:center">${i + 1}</td>
            <td>${name}</td>
            <td>${sdt || ""}</td>
            <td style="text-align:center">${(tyle * 100).toFixed(0)}%</td>
            <td style="text-align:right">${(dongGopMap[id] || 0).toLocaleString()} ₫</td>
          </tr>
        `).join("")}
      </tbody>
    `;
    contentSections[0].appendChild(table1);
  } catch (err) {
    contentSections[0].innerHTML = `<p style="color:red">Lỗi tải thành viên: ${err.message}</p>`;
  }


  // ✅ Tab 2: Chi tiêu
  try {
    const res = db.exec(`
      SELECT ct_thoi_gian, ct_ten_khoan, ct_so_tien, ct_quy_chung, dm.dm_ten
      FROM ChiTieu
      LEFT JOIN DanhMuc dm ON dm.dm_id = ChiTieu.ct_danh_muc_id
      WHERE ct_tour_id = ${tourId}
      ORDER BY ct_thoi_gian ASC
    `);
    const chiTieu = res[0]?.values || [];

    const table2 = document.createElement("table");
    table2.border = "1";
    table2.cellPadding = "5";
    table2.style.cssText = "border-collapse: collapse; width: 100%;";

    table2.innerHTML = `
      <thead>
        <tr style="background:#f0f0f0;">
          <th>STT</th>
          <th>Thời gian</th>
          <th>Tên khoản chi</th>
          <th>Mục chi</th>
          <th>Số tiền</th>
          <th>Nguồn chi</th>
        </tr>
      </thead>
      <tbody>
        ${chiTieu.map(([thoigian, ten, tien, quyChung, mucChi], i) => {
          const nguon = (quyChung === 1 || quyChung === true) ? "Quỹ chung" : "Ứng trước";
          return `
            <tr>
              <td style="text-align:center">${i + 1}</td>
              <td>${formatDateTime(thoigian)}</td>
              <td>${ten}</td>
              <td>${mucChi || "–"}</td>
              <td style="text-align:right">${tien.toLocaleString()} ₫</td>
              <td>${nguon}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    `;
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


/** Quản lý Tour */
// Mở form thêm Tour
function handleThemTour() {
  onMenuAction(); // đóng menu nếu cần
  document.getElementById("themTourModal").style.display = "flex";

  // Reset các trường nhập
  document.getElementById("tour-ten").value = "";
  document.getElementById("tour-ngay-di").value = new Date().toISOString().split("T")[0];
  document.getElementById("tour-ngay-ve").value = new Date().toISOString().split("T")[0];
  document.getElementById("tour-diadiem").value = "";
  document.getElementById("tour-ghichu").value = "";

  // Reset checkbox và danh sách sao chép tour
  const checkbox = document.getElementById("tour-copy-checkbox");
  const select = document.getElementById("tour-copy-select");
  checkbox.checked = false;
  select.disabled = true;
  select.innerHTML = '<option value="">-- Chọn tour để sao chép --</option>';

  // Nạp danh sách tour vào combobox (nếu dùng sao chép thành viên)
  const result = db.exec(`SELECT tour_id, tour_ten FROM Tour`);
  result[0]?.values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

// Đóng form
function closeThemTour() {
  document.getElementById("themTourModal").style.display = "none";
}

// Check box Copy danh sách thành viên
function toggleCopyFromTour() {
  const checkbox = document.getElementById("tour-copy-checkbox");
  const select = document.getElementById("tour-copy-select");
  select.disabled = !checkbox.checked;
}

// Gửi dữ liệu thêm tour
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

  // Thêm tour vào DB (sửa tên cột)
  db.run(`
    INSERT INTO Tour (tour_ten, tour_ngay_di, tour_ngay_ve, tour_dia_diem, tour_mo_ta)
    VALUES (?, ?, ?, ?, ?)
  `, [ten, ngayDi, ngayVe, diadiem, ghichu]);

  // Lấy ID tour vừa thêm
  const newTourId = db.exec(`SELECT last_insert_rowid()`)[0].values[0][0];

  // Nếu chọn sao chép thành viên từ tour khác
  const checkbox = document.getElementById("tour-copy-checkbox");
  const sourceTourId = document.getElementById("tour-copy-select").value;

  if (checkbox.checked && sourceTourId) {
    const members = db.exec(`
      SELECT tv_ho_ten, tv_sdt, tv_ty_le_dong
      FROM ThanhVien 
      WHERE tv_tour_id = ${sourceTourId}
    `);

    members[0]?.values.forEach(([name, sdt, tyle]) => {
      db.run(`
        INSERT INTO ThanhVien (tv_ho_ten, tv_sdt, tv_ty_le_dong, tv_tour_id)
        VALUES (?, ?, ?, ?)
      `, [name, sdt, tyle, newTourId]);
    });
  }


  saveToLocal();        // Lưu DB vào localforage
  closeThemTour();      // Đóng form
  loadTour(newTourId);  // Load lại tab, chuyển sang tour vừa tạo

  // Gợi ý thêm thành viên nếu chưa có
  setTimeout(() => {
    if (typeof checkIfNoThanhVien === "function") {
      checkIfNoThanhVien(newTourId);
    }
  }, 100);
}

// Mở form sửa Tour
function handleSuaTour() {
  onMenuAction();
  document.getElementById("suaTourModal").style.display = "flex";

  const select = document.getElementById("edit-tour-select");
  select.innerHTML = "";

  const result = db.exec(`SELECT tour_id, tour_ten FROM Tour ORDER BY tour_ngay_di DESC`);
  const allTours = result[0]?.values || [];

  const activeTab = document.querySelector(".tab-button.active");
  const activeTourId = activeTab ? activeTab.dataset.tourId : null;

  allTours.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    if (id == activeTourId) opt.selected = true;
    select.appendChild(opt);
  });

  loadTourInfoToForm();
}

function closeSuaTour() {
  document.getElementById("suaTourModal").style.display = "none";
}

function loadTourInfoToForm() {
  const tourId = document.getElementById("edit-tour-select").value;

  const result = db.exec(`
    SELECT tour_ten, tour_ngay_di, tour_ngay_ve, tour_dia_diem, tour_mo_ta
    FROM Tour WHERE tour_id = ${tourId}
  `);

  if (result.length === 0) return;

  const [ten, ngayDi, ngayVe, diaDiem, ghiChu] = result[0].values[0];

  document.getElementById("edit-ten-tour").value = ten;
  document.getElementById("edit-ngay-di").value = ngayDi;
  document.getElementById("edit-ngay-ve").value = ngayVe;
  document.getElementById("edit-diadiem-tour").value = diaDiem;
  document.getElementById("edit-ghichu-tour").value = ghiChu;

  switchTab(tourId); // Chuyển về tab tương ứng
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
    SET tour_ten = ?, tour_ngay_di = ?, tour_ngay_ve = ?, tour_dia_diem = ?, tour_mo_ta = ?
    WHERE tour_id = ?
  `, [ten, ngayDi, ngayVe, diaDiem, ghiChu, tourId]);

  saveToLocal();
  closeSuaTour();
  loadTour(tourId); // Reload lại tab
}

// Mở form xoá tour
function handleXoaTour() {
  onMenuAction();
  document.getElementById("xoaTourModal").style.display = "flex";

  const select = document.getElementById("xoa-tour-select");
  select.innerHTML = "";

  const result = db.exec(`SELECT tour_id, tour_ten FROM Tour`);
  const activeTab = document.querySelector(".tab-button.active");
  const activeTourId = activeTab ? activeTab.dataset.tourId : null;

  let selectedTourId = null;

  result[0]?.values.forEach(([id, ten]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = ten;
    if (id == activeTourId) {
      opt.selected = true;
      selectedTourId = id;
    }
    select.appendChild(opt);
  });

  if (selectedTourId) {
    switchTab(selectedTourId);
  }
}

function closeXoaTour() {
  document.getElementById("xoaTourModal").style.display = "none";
}

function submitXoaTour() {
  const tourId = document.getElementById("xoa-tour-select").value;

  if (!confirm("Bạn có chắc muốn xoá tour này và toàn bộ dữ liệu liên quan?")) return;

  // Xoá toàn bộ dữ liệu liên quan
  db.run(`DELETE FROM Tour WHERE tour_id = ?`, [tourId]);
  db.run(`DELETE FROM ThanhVien WHERE tv_tour_id = ?`, [tourId]);
  db.run(`DELETE FROM ChiTieu WHERE ct_tour_id = ?`, [tourId]);
  db.run(`DELETE FROM DongGop WHERE dg_tour_id = ?`, [tourId]);

  saveToLocal();
  closeXoaTour();
  loadTour();
  checkIfNoTours?.();
}

// Kiểm tra xem Tour có thành viên chưa
function checkIfNoThanhVien(tourId) {
  try {
    const result = db.exec(`SELECT COUNT(*) FROM ThanhVien WHERE tv_tour_id = ${tourId}`);
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

/**Quản lý thành viên*/
// Mở bảng thêm thành viên
function handleThemThanhVien() {
  document.getElementById("themTvModal").style.display = "flex";

  const select = document.getElementById("tv-tour-select");
  select.innerHTML = "";

  // 🔄 Sửa: tour_id, tour_ten theo CSDL mới
  const result = db.exec(`SELECT tour_id, tour_ten FROM Tour`);
  const activeTab = document.querySelector(".tab-button.active");
  const activeTourId = activeTab ? activeTab.dataset.tourId : null;

  result[0]?.values.forEach(([id, ten]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = ten;
    if (id == activeTourId) opt.selected = true; // ✅ chọn đúng tab đang mở
    select.appendChild(opt);
  });

  // ✅ Reset các trường nhập
  document.getElementById("tv-ten").value = "";
  document.getElementById("tv-sdt").value = "";
  document.getElementById("tv-tyle").value = "100";

  // Focus ô nhập tên
  setTimeout(() => document.getElementById("tv-ten").focus(), 10);

  // ✅ Đảm bảo tab tour đang active vẫn hiển thị
  if (activeTourId) {
    switchTab(activeTourId);
  }
}

function closeThemThanhVien() {
  document.getElementById("themTvModal").style.display = "none";
}

function submitThemThanhVien() {
  const tourId = document.getElementById("tv-tour-select").value;
  const tenInput = document.getElementById("tv-ten");
  const sdtInput = document.getElementById("tv-sdt");
  const tyleInput = document.getElementById("tv-tyle");

  const tenRaw = tenInput.value.trim();
  const ten = capitalizeWords(tenRaw);
  const sdt = sdtInput.value.trim();
  const tyle = parseInt(tyleInput.value);

  if (!ten) {
    alert("Hãy nhập họ và tên thành viên.");
    return;
  }

  db.run(`
    INSERT INTO ThanhVien (tv_tour_id, tv_ho_ten, tv_sdt, tv_ty_le_dong)
    VALUES (?, ?, ?, ?)
  `, [tourId, ten, sdt, isNaN(tyle) ? 1 : tyle / 100]);

  saveToLocal();
  loadTour(tourId);

  tenInput.value = "";
  sdtInput.value = "";
  tyleInput.value = "100";
  tenInput.focus();
}

function handleSuaThanhVien() {
  onMenuAction();
  document.getElementById("suaTvModal").style.display = "flex";

  const tourSelect = document.getElementById("edit-tv-tour");
  tourSelect.innerHTML = "";

  const result = db.exec(`SELECT tour_id, tour_ten FROM Tour`);
  const activeTab = document.querySelector(".tab-button.active");
  const activeTourId = activeTab ? activeTab.dataset.tourId : null;

  result[0]?.values.forEach(([id, ten]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = ten;
    if (id == activeTourId) opt.selected = true;
    tourSelect.appendChild(opt);
  });

  const selectedTourId = tourSelect.value;
  loadTour(selectedTourId);

  setTimeout(() => {
    loadThanhVienForEdit();
  }, 50);
}

function loadThanhVienForEdit() {
  const tourId = document.getElementById("edit-tv-tour").value;
  const tvSelect = document.getElementById("edit-tv-select");
  tvSelect.innerHTML = "";

  const result = db.exec(`
    SELECT tv_id, tv_ho_ten 
    FROM ThanhVien 
    WHERE tv_tour_id = ${tourId}
  `);

  result[0]?.values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    tvSelect.appendChild(opt);
  });

  fillOldThanhVienInfo();

  setTimeout(() => {
    if (document.querySelector(`.tab-button[data-tour-id="${tourId}"]`)) {
      switchTab(tourId);
    }
  }, 0);
}

function fillOldThanhVienInfo() {
  const tvSelect = document.getElementById("edit-tv-select");
  const selectedId = tvSelect.value;

  if (!selectedId) return;

  const result = db.exec(`
    SELECT tv_ho_ten, tv_sdt, tv_ty_le_dong
    FROM ThanhVien
    WHERE tv_id = ${selectedId}
  `);

  const [ten, sdt, tyle] = result[0]?.values[0] || [];

  document.getElementById("edit-tv-name").value = ten || "";
  document.getElementById("edit-tv-sdt").value = sdt || "";
  document.getElementById("edit-tv-tyle").value = ((tyle || 1) * 100).toFixed(0);
}


function submitSuaThanhVien() {
  const tvId = document.getElementById("edit-tv-select").value;
  const rawName = document.getElementById("edit-tv-name").value.trim();
  const newName = capitalizeWords(rawName);
  const sdt = document.getElementById("edit-tv-sdt").value.trim();
  const tyle = parseInt(document.getElementById("edit-tv-tyle").value.trim()) || 100;
  const tourId = document.getElementById("edit-tv-tour").value;

  if (!newName) {
    alert("Hãy nhập họ và tên mới.");
    return;
  }

  db.run(`
    UPDATE ThanhVien
    SET tv_ho_ten = ?, tv_sdt = ?, tv_ty_le_dong = ?
    WHERE tv_id = ?
  `, [newName, sdt, tyle / 100, tvId]);

  saveToLocal();
  closeSuaThanhVien();
  loadTour(tourId);
}

function closeSuaThanhVien() {
  document.getElementById("suaTvModal").style.display = "none";
}

function handleXoaThanhVien() {
  onMenuAction();
  document.getElementById("xoaTvModal").style.display = "flex";

  const tourSelect = document.getElementById("xoa-tv-tour");
  tourSelect.innerHTML = "";

  const result = db.exec(`SELECT tour_id, tour_ten FROM Tour`);
  const activeTab = document.querySelector(".tab-button.active");
  const activeTourId = activeTab ? activeTab.dataset.tourId : null;

  result[0]?.values.forEach(([id, ten]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = ten;
    if (id == activeTourId) opt.selected = true;
    tourSelect.appendChild(opt);
  });

  const selectedTourId = tourSelect.value;
  loadTour(selectedTourId);

  setTimeout(() => {
    loadThanhVienForXoa();
  }, 50);
}

function loadThanhVienForXoa() {
  const tourId = document.getElementById("xoa-tv-tour").value;
  const tvSelect = document.getElementById("xoa-tv-select");
  tvSelect.innerHTML = "";

  const result = db.exec(`
    SELECT tv_id, tv_ho_ten 
    FROM ThanhVien 
    WHERE tv_tour_id = ${tourId}
  `);

  result[0]?.values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    tvSelect.appendChild(opt);
  });

  setTimeout(() => {
    if (document.querySelector(`.tab-button[data-tour-id="${tourId}"]`)) {
      switchTab(tourId);
    }
  }, 0);
}

function closeXoaThanhVien() {
  document.getElementById("xoaTvModal").style.display = "none";
}

function submitXoaThanhVien() {
  const tvId = document.getElementById("xoa-tv-select").value;
  const tourId = document.getElementById("xoa-tv-tour").value;

  db.run(`DELETE FROM ThanhVien WHERE tv_id = ?`, [tvId]);
  db.run(`DELETE FROM DongGop WHERE dg_tv_id = ?`, [tvId]);
  db.run(`DELETE FROM ChiTieu WHERE ct_nguoi_ung_id = ?`, [tvId]);

  saveToLocal();
  closeXoaThanhVien();
  loadTour(tourId);
}


/** Quản lý Thu Chi */
// Thu
function handleThu() {
  onMenuAction();
  document.getElementById("thuModal").style.display = "flex";

  const tourSelect = document.getElementById("thu-tour-select");
  const tvSelect = document.getElementById("thu-tv-select");

  tourSelect.innerHTML = "";
  tvSelect.innerHTML = "";

  const result = db.exec(`SELECT tour_id, tour_ten FROM Tour`);
  const activeTab = document.querySelector(".tab-button.active");
  const activeTourId = activeTab ? activeTab.dataset.tourId : null;

  result[0]?.values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    if (id == activeTourId) opt.selected = true;
    tourSelect.appendChild(opt);
  });

  // Gọi đổi danh sách thành viên ban đầu
  onChangeTourInThu();

  // Reset các trường
  document.getElementById("thu-so-tien").value = "";
  document.getElementById("thu-thoi-gian").value = new Date().toISOString().slice(0, 16);
  document.getElementById("thu-ghi-chu").value = "";
}

function closeThu() {
  document.getElementById("thuModal").style.display = "none";
}

// Tải danh sách thành viên khi chọn Tour
function onChangeTourInThu() {
  const tourId = document.getElementById("thu-tour-select").value;
  const tvSelect = document.getElementById("thu-tv-select");
  tvSelect.innerHTML = "";

  const res = db.exec(`
    SELECT tv_id, tv_ho_ten 
    FROM ThanhVien 
    WHERE tv_tour_id = ${tourId}
  `);

  res[0]?.values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    tvSelect.appendChild(opt);
  });
}

function submitThu() {
  const tourId = document.getElementById("thu-tour-select").value;
  const tvId = document.getElementById("thu-tv-select").value;
  const soTien = parseInt(document.getElementById("thu-so-tien").value);
  const thoiGian = document.getElementById("thu-thoi-gian").value;
  const ghiChu = document.getElementById("thu-ghi-chu").value.trim();

  if (!tourId || !tvId || isNaN(soTien) || soTien <= 0 || !thoiGian) {
    alert("Vui lòng nhập đầy đủ thông tin hợp lệ.");
    return;
  }

  db.run(`
    INSERT INTO DongGop (dg_tour_id, dg_tv_id, dg_so_tien, dg_thoi_gian, dg_ghi_chu)
    VALUES (?, ?, ?, ?, ?)
  `, [tourId, tvId, soTien, thoiGian, ghiChu]);

  saveToLocal();
  closeThu();
  loadTour(tourId);
}


// Chi
function handleChi() {
  onMenuAction();
  document.getElementById("chiModal").style.display = "flex";

  const tourSelect = document.getElementById("chi-tour-select");
  tourSelect.innerHTML = "";

  const result = db.exec(`SELECT tour_id, tour_ten FROM Tour`);
  const activeTab = document.querySelector(".tab-button.active");
  const activeTourId = activeTab ? activeTab.dataset.tourId : null;

  result[0]?.values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = name;
    if (id == activeTourId) opt.selected = true;
    tourSelect.appendChild(opt);
  });

  onChangeTourInChi(); // Cập nhật danh sách nguồn chi
  loadDanhMucToSelect();

  // Reset form
  document.getElementById("chi-ten-khoan").value = "";
  document.getElementById("chi-so-tien").value = "";
  document.getElementById("chi-thoi-gian").value = new Date().toISOString().slice(0, 16);
  document.getElementById("chi-ghi-chu").value = "";

  // ✅ Focus vào ô tên khoản chi
  document.getElementById("chi-ten-khoan").focus();
}


function closeChi() {
  document.getElementById("chiModal").style.display = "none";
}

// Tải danh sách thành viên
function onChangeTourInChi() {
  const tourId = document.getElementById("chi-tour-select").value;
  const nguonChiSelect = document.getElementById("chi-nguon-chi");
  nguonChiSelect.innerHTML = "";

  // ⬅️ Mặc định đầu tiên là "Quỹ chung"
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "Quỹ chung";
  nguonChiSelect.appendChild(defaultOpt);

  const res = db.exec(`
    SELECT tv_id, tv_ho_ten 
    FROM ThanhVien 
    WHERE tv_tour_id = ${tourId}
  `);

  res[0]?.values.forEach(([id, name]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = `${name} (Ứng)`;
    nguonChiSelect.appendChild(opt);
  });
}

// Tải danh sách danh mục chi
function loadDanhMucToSelect() {
  const select = document.getElementById("chi-danh-muc-select");
  select.innerHTML = "";

  const result = db.exec("SELECT dm_id, dm_ten FROM DanhMuc ORDER BY dm_ten ASC");
  result[0]?.values.forEach(([id, ten]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = ten;
    select.appendChild(opt);
  });
}

function submitChi() {
  const tourId = document.getElementById("chi-tour-select").value;
  const tenKhoan = document.getElementById("chi-ten-khoan").value.trim();
  const soTien = parseInt(document.getElementById("chi-so-tien").value);
  const thoiGian = document.getElementById("chi-thoi-gian").value;
  const ghiChu = document.getElementById("chi-ghi-chu").value.trim();
  const nguonChi = document.getElementById("chi-nguon-chi").value;
  const danhMucId = document.getElementById("chi-danh-muc-select").value;

  const isQuyChung = !nguonChi;
  const nguoiUngId = isQuyChung ? null : nguonChi;

  if (!tourId || !tenKhoan || isNaN(soTien) || soTien <= 0 || !thoiGian) {
    alert("Vui lòng nhập đầy đủ thông tin hợp lệ.");
    return;
  }

  db.run(`
    INSERT INTO ChiTieu (
      ct_tour_id, ct_thoi_gian, ct_ten_khoan,
      ct_so_tien, ct_quy_chung, ct_nguoi_ung_id,
      ct_danh_muc_id, ct_ghi_chu
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    tourId, thoiGian, tenKhoan,
    soTien, isQuyChung ? 1 : 0, nguoiUngId,
    danhMucId || null, ghiChu
  ]);

  saveToLocal();
  closeChi();
  loadTour(tourId);
}








/** Quản lý sao lưu cơ sở dữ liệu */
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
  const fileName = `Dulich_database_${dd}-${mm}-${yyyy}.db`;

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



/** Các hàm bổ trợ */ 
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

// Viết hoa chữ cái đầu trong tên thành viên
function capitalizeWords(str) {
  return str
    .toLocaleLowerCase('vi-VN')
    .split(' ')
    .filter(word => word) // bỏ khoảng trắng thừa
    .map(word => word.charAt(0).toLocaleUpperCase('vi-VN') + word.slice(1))
    .join(' ');
}

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