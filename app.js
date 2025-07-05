let db;
let SQL;

let deferredPrompt = null;
let isIntroClosed = false;
let _nextSelectedSubTab = 1;


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
      loadTour();

      if (isIntroClosed) {
        checkIfNoTours();
      } else {
        window._pendingInitAfterIntro = () => checkIfNoTours();
      }

    } else {
      initNewDatabase(); // đã xử lý trong đó
    }

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
  enableEnterToJump('#themTvModal', '.modal-actions button');
  enableEnterToJump('#suaTvModal', '.modal-actions button');
  enableEnterToJump('#chiModal', '.modal-actions button');

  // 💰 Gắn format tiền cho các input số tiền
  attachCurrencyFormatter("#tv-sotien");
  attachCurrencyFormatter("#thu-so-tien");
  attachCurrencyFormatter("#chi-so-tien");
  attachCurrencyFormatter("#dg-so-tien");
  // Gắn format % cho input Tỷ lệ
  attachPercentageFormatter("#tv-tyle");
  attachPercentageFormatter("#edit-tv-tyle");


  // Khi cả DOM và DB đã sẵn sàng thì xử lý
  document.addEventListener("sqlite-ready", () => {
    loadTour();

    // checkIfNoTours();

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
      ct_danh_muc_id INTEGER, -- 🔥 Mới thêm
      ct_ghi_chu TEXT,
      FOREIGN KEY (ct_tour_id) REFERENCES Tour(tour_id),
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
  const mucChiMacDinh = ["🚗 Di chuyển", "🍜 Ăn uống", "🛏️ Lưu trú", "🎉 Giải trí", "🧩 Chi phí khác"];
  mucChiMacDinh.forEach(ten => {
    db.run("INSERT OR IGNORE INTO DanhMuc (dm_ten) VALUES (?)", [ten]);
  });

  saveToLocal();         // ✅ Lưu DB mới vào localforage
  loadTour();            // ✅ Cập nhật UI

  if (isIntroClosed) {
    checkIfNoTours();   // nếu có xử lý riêng khi chưa có tour
  } else {
    window._pendingInitAfterIntro = () => {
      checkIfNoTours();
    };
  }
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
      // Nếu intro chưa đóng, chờ sau khi user tắt modal
      if (!isIntroClosed) {
        window._pendingInitAfterIntro = () => checkIfNoTours(); // gọi lại sau
        return;
      }

      // Nếu intro đã đóng thì mới hiện thông báo
      setTimeout(() => {
        alert("🏕️ Chưa có tour nào được tạo.\n" + "      Hãy tạo tour mới để bắt đầu.");
        handleThemTour();
      }, 200);
    }
  } catch (err) {
    console.error("Lỗi khi kiểm tra tour:", err.message);
  }
}


// Load danh sách Tour vào Tab
function loadTour(selectedTourId = null, selectedSubTab = 1) {
  const tabs = document.getElementById("tabs");
  const contents = document.getElementById("tabContents");
  tabs.innerHTML = "";
  contents.innerHTML = "";

  let tours;
  try {
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
    tabBtn.onclick = () => switchTab(tourId);

    const isActive = selectedTourId ? tourId == selectedTourId : index === 0;
    if (isActive) tabBtn.classList.add("active");

    tabs.appendChild(tabBtn);

    const contentDiv = document.createElement("div");
    contentDiv.className = "tab-content" + (isActive ? " active" : "");
    contentDiv.id = `tab-${tourId}`;
    contents.appendChild(contentDiv);

    if (isActive) {
      if (typeof showTourData === "function") {
        showTourData(tourId, selectedSubTab);  // ✅ truyền tab cần chọn
      }
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
// Hiển thị bảng
function showTourData(tourId, selectedSubTab = 1) {
  const container = document.getElementById(`tab-${tourId}`);
  container.innerHTML = "";

  // Thông tin tour
  let infoDiv = null;
  try {
    const tourInfo = db.exec(`
      SELECT tour_ten, tour_dia_diem, tour_mo_ta, tour_ngay_di, tour_ngay_ve
      FROM Tour WHERE tour_id = ${tourId}
    `);
    const ten = tourInfo[0]?.values[0]?.[0] || "Không rõ";
    const dia_diem = tourInfo[0]?.values[0]?.[1] || "Chưa rõ";
    const mo_ta = tourInfo[0]?.values[0]?.[2] || "";
    const ngay_di = tourInfo[0]?.values[0]?.[3];
    const ngay_ve = tourInfo[0]?.values[0]?.[4];

    const tvCountRes = db.exec(`SELECT COUNT(*) FROM ThanhVien WHERE tv_tour_id = ${tourId}`);
    const soThanhVien = tvCountRes[0]?.values[0][0] || 0;

    const thuRes = db.exec(`SELECT SUM(dg_so_tien) FROM DongGop WHERE dg_tour_id = ${tourId}`);
    const tongThu = thuRes[0]?.values[0][0] || 0;

    const chiRes = db.exec(`SELECT SUM(ct_so_tien) FROM ChiTieu WHERE ct_tour_id = ${tourId}`);
    const tongChi = chiRes[0]?.values[0][0] || 0;

    const conLai = tongThu - tongChi;

    // Định dạng ngày tháng cho dễ đọc (VD: 03/07/2025)
    const formatDate = (dateString) => {
      if (!dateString) return "Chưa rõ";
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    };

    // Tạo chuỗi hiển thị thời gian
    const thoi_gian = `🗓️ Thời gian: ${formatDate(ngay_di)} - ${formatDate(ngay_ve)}`;

    // Phần toast chi tiết
    const fullInfo = `✈️ Tour ${ten} - 👥 ${soThanhVien} thành viên<br>${thoi_gian}<br>🌎 Địa điểm: ${dia_diem} <br> 📝 ${mo_ta || "Không có mô tả"}`;

    // Tạo phần tử hiển thị
    infoDiv = document.createElement("div");
    infoDiv.className = "tour-info";
    infoDiv.innerHTML = `
      ✈️ Tour <a href='#' 
        onclick="showToast(\`${fullInfo.replace(/`/g, "\\`")}\`, '', true)"
        style="color: #007bff; font-weight: bold; text-decoration: none;"
      >${ten}</a> – 👥 ${soThanhVien} thành viên<br>
      Tổng thu: <b>${tongThu.toLocaleString()} ₫</b> – Tổng chi: <b>${tongChi.toLocaleString()} ₫</b> 
      <br><span style="color:${conLai >= 0 ? 'green' : 'red'}">Còn lại: ${conLai.toLocaleString()} ₫</span>
    `;
  } catch (err) {
    console.error("Lỗi lấy thông tin tour:", err.message);
  }


  // Vùng tab radio
  const tabWrapper = document.createElement("div");
  tabWrapper.innerHTML = `
    <div class="table-tab-container">
      <input type="radio" name="table-tab-${tourId}" id="table-tab-1-${tourId}" class="table-tab-radio" ${selectedSubTab == 1 ? 'checked' : ''}>
      <label for="table-tab-1-${tourId}" class="table-tab-label">Thành viên</label>

      <input type="radio" name="table-tab-${tourId}" id="table-tab-2-${tourId}" class="table-tab-radio" ${selectedSubTab == 2 ? 'checked' : ''}>
      <label for="table-tab-2-${tourId}" class="table-tab-label">Thu</label>

      <input type="radio" name="table-tab-${tourId}" id="table-tab-3-${tourId}" class="table-tab-radio" ${selectedSubTab == 3 ? 'checked' : ''}>
      <label for="table-tab-3-${tourId}" class="table-tab-label">Chi</label>

      <div class="table-tab-indicator"></div>

      <div class="table-tab-content-wrapper">
        <div class="table-tab-content" data-tab="1"></div>
        <div class="table-tab-content" data-tab="2"></div>
        <div class="table-tab-content" data-tab="3"></div>
      </div>
    </div>
  `;

  if (infoDiv) container.appendChild(infoDiv);
  container.appendChild(tabWrapper);

  const contentSections = [
    tabWrapper.querySelector('.table-tab-content[data-tab="1"]'),
    tabWrapper.querySelector('.table-tab-content[data-tab="2"]'),
    tabWrapper.querySelector('.table-tab-content[data-tab="3"]')
  ];

  // Tab 1: Thành viên
  try {
    const res = db.exec(`
      SELECT tv_id, tv_ho_ten, tv_sdt, tv_ty_le_dong, tv_gioi_tinh
      FROM ThanhVien WHERE tv_tour_id = ${tourId}
    `);
    const members = res[0]?.values || [];

    const sumTyle = members.reduce((sum, m) => sum + (m[3] || 0), 0);
    const dongGopMap = {};
    const gopRes = db.exec(`
      SELECT dg_tv_id, SUM(dg_so_tien)
      FROM DongGop WHERE dg_tour_id = ${tourId}
      GROUP BY dg_tv_id
    `);
    gopRes[0]?.values.forEach(([id, sum]) => { dongGopMap[id] = sum; });

    const chiRes = db.exec(`
      SELECT SUM(ct_so_tien)
      FROM ChiTieu WHERE ct_tour_id = ${tourId}
    `);
    const tongChiTieu = chiRes[0]?.values[0][0] || 0;

    const lamTronNgan = (x) => x >= 0
      ? Math.floor(x / 1000) * 1000
      : Math.ceil(x / 1000) * 1000;

    const table = document.createElement("table");
    table.border = "0.5";
    table.cellPadding = "5";
    table.style.cssText = "border-collapse: collapse; width: 100%;";

    table.innerHTML = `
      <thead>
        <tr>
          <th>STT</th><th></th><th>Họ và tên</th><th>SĐT</th><th>Tỉ lệ</th><th>Đã đóng</th><th>Tổng kết</th>
        </tr>
      </thead>
      <tbody>
        ${members.map(([id, name, sdt, tyle, gioi], i) => {
          const icon = { nam: "🙋‍♂️", nu: "🙋‍♀️", be_trai: "👦", be_gai: "👧" }[gioi] || "❓";
          const tyLeDong = tyle || 0;
          const daDong = dongGopMap[id] || 0;
          const chiPhaiDong = sumTyle > 0 ? tongChiTieu * (tyLeDong / sumTyle) : 0;
          const chenhLech = lamTronNgan(daDong - chiPhaiDong);

          return `
            <tr>
              <td style="text-align:center">${i + 1}</td>
              <td style="text-align:center">${icon}</td>
              <td>${name}</td>
              <td>${sdt || ""}</td>
              <td style="text-align:center">${(tyLeDong * 100).toFixed(0)}%</td>
              <td style="text-align:right">${daDong.toLocaleString()} ₫</td>
              <td style="text-align:right; color:${chenhLech >= 0 ? "green" : "red"}">
                ${chenhLech >= 0 ? "+" : ""}${chenhLech.toLocaleString()} ₫
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    `;
    contentSections[0].appendChild(table);
  } catch (err) {
    contentSections[0].innerHTML = `<p style="color:red">Lỗi thành viên: ${err.message}</p>`;
  }

  // Tab 2: Thu
  try {
    const res = db.exec(`
      SELECT dg.dg_id, dg.dg_thoi_gian, tv.tv_ho_ten, dg.dg_so_tien, dg.dg_ghi_chu
      FROM DongGop dg
      LEFT JOIN ThanhVien tv ON tv.tv_id = dg.dg_tv_id
      WHERE dg.dg_tour_id = ${tourId}
      ORDER BY dg.dg_thoi_gian ASC
    `);
    const data = res[0]?.values || [];

    const table = document.createElement("table");
    table.border = "0.5";
    table.cellPadding = "5";
    table.style.cssText = "border-collapse: collapse; width: 100%;";

    table.innerHTML = `
      <thead>
        <tr>
          <th>STT</th><th>Thời gian</th><th>Họ và tên</th><th>Số tiền</th><th>Ghi chú</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${data.map(([id, time, name, amount, note], i) => `
          <tr>
            <td style="text-align:center">${i + 1}</td>
            <td>${formatDateTime(time)}</td>
            <td>${name}</td>
            <td style="text-align:right">${amount.toLocaleString()} ₫</td>
            <td>${note || ""}</td>
            <td style="text-align:center">
              <span onclick="xoaDongGop(${id}, ${tourId})" style="cursor:pointer" title="Xoá">🗑️</span>
            </td>
          </tr>
        `).join("")}
      </tbody>
    `;
    contentSections[1].appendChild(table);
  } catch (err) {
    contentSections[1].innerHTML = `<p style="color:red">Lỗi thu tiền: ${err.message}</p>`;
  }

  // Tab 3: Chi tiêu
  try {
    const res = db.exec(`
      SELECT ct_id, ct_thoi_gian, ct_ten_khoan, ct_so_tien, dm.dm_ten, ct_ghi_chu
      FROM ChiTieu
      LEFT JOIN DanhMuc dm ON dm.dm_id = ChiTieu.ct_danh_muc_id
      WHERE ct_tour_id = ${tourId}
      ORDER BY ct_thoi_gian ASC
    `);
    const data = res[0]?.values || [];

    const table = document.createElement("table");
    table.border = "0.5";
    table.cellPadding = "5";
    table.style.cssText = "border-collapse: collapse; width: 100%;";

    table.innerHTML = `
      <thead>
        <tr>
          <th>STT</th><th>Thời gian</th><th>Tên khoản</th><th>Danh mục</th><th>Số tiền</th><th>Ghi chú</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${data.map(([id, time, name, amount, category, note], i) => `
          <tr>
            <td style="text-align:center">${i + 1}</td>
            <td>${formatDateTime(time)}</td>
            <td>${name}</td>
            <td>${category || ""}</td>
            <td style="text-align:right">${amount.toLocaleString()} ₫</td>
            <td>${note || ""}</td>
            <td style="text-align:center">
              <span onclick="xoaChiTieu(${id}, ${tourId})" style="cursor:pointer" title="Xoá">🗑️</span>
            </td>
          </tr>
        `).join("")}
      </tbody>
    `;
    contentSections[2].appendChild(table);
  } catch (err) {
    contentSections[2].innerHTML = `<p style="color:red">Lỗi chi tiêu: ${err.message}</p>`;
  }
}


function xoaDongGop(dgId, tourId) {
  if (!confirm("Bạn có chắc muốn xoá khoản thu này?")) return;

  db.run(`DELETE FROM DongGop WHERE dg_id = ?`, [dgId]);
  saveToLocal();
  loadTour(tourId);
}

function xoaChiTieu(ctId, tourId) {
  if (!confirm("Bạn có chắc muốn xoá khoản chi này?")) return;

  db.run(`DELETE FROM ChiTieu WHERE ct_id = ?`, [ctId]);
  saveToLocal();
  loadTour(tourId);
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
  document.getElementById("tour-ten").focus();
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
  showToast(`Đã thêm tour ${ten}`, '', true);

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

  // Lấy tên cũ trước khi cập nhật
  const tourResult = db.exec(`SELECT tour_ten FROM Tour WHERE tour_id = ?`, [tourId]);
  const oldName = tourResult[0]?.values[0]?.[0] || "tour";

  // Cập nhật thông tin tour
  db.run(`
    UPDATE Tour
    SET tour_ten = ?, tour_ngay_di = ?, tour_ngay_ve = ?, tour_dia_diem = ?, tour_mo_ta = ?
    WHERE tour_id = ?
  `, [ten, ngayDi, ngayVe, diaDiem, ghiChu, tourId]);

  saveToLocal();
  closeSuaTour();
  loadTour(tourId); // Reload lại tab

  // Hiển thị toast thông báo
  showToast(`Đã sửa tour ${oldName} thành ${ten}`, '', true);
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

  // Lấy tên tour trước khi xoá để hiển thị toast
  const tourResult = db.exec(`SELECT tour_ten FROM Tour WHERE tour_id = ?`, [tourId]);
  const tourName = tourResult[0]?.values[0]?.[0] || "tour";

  // Xoá toàn bộ dữ liệu liên quan
  db.run(`DELETE FROM Tour WHERE tour_id = ?`, [tourId]);
  db.run(`DELETE FROM ThanhVien WHERE tv_tour_id = ?`, [tourId]);
  db.run(`DELETE FROM ChiTieu WHERE ct_tour_id = ?`, [tourId]);
  db.run(`DELETE FROM DongGop WHERE dg_tour_id = ?`, [tourId]);

  saveToLocal();
  closeXoaTour();
  loadTour();
  checkIfNoTours?.();

  // Hiển thị Toast sau khi xoá
  showToast(`Đã xoá tour ${tourName}`, '', true);
}


// Kiểm tra xem Tour có thành viên chưa
function checkIfNoThanhVien(tourId) {
  try {
    const result = db.exec(`SELECT COUNT(*) FROM ThanhVien WHERE tv_tour_id = ${tourId}`);
    const count = result[0]?.values?.[0]?.[0] || 0;

    if (count === 0) {
      setTimeout(() => {
        alert("👫 Tour này chưa có thành viên.\n" + "       Hãy thêm thành viên vào tour.");
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
  onMenuAction();
  document.getElementById("themTvModal").style.display = "flex";

  const select = document.getElementById("tv-tour-select");
  select.innerHTML = "";

  const result = db.exec(`SELECT tour_id, tour_ten FROM Tour`);
  const activeTab = document.querySelector(".tab-button.active");
  const activeTourId = activeTab ? activeTab.dataset.tourId : null;

  result[0]?.values.forEach(([id, ten]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = ten;
    if (id == activeTourId) opt.selected = true;
    select.appendChild(opt);
  });

  document.getElementById("tv-ten").value = "";
  document.getElementById("tv-sdt").value = "";
  const tyleInput = document.getElementById("tv-tyle");
tyleInput.value = "100";
attachPercentageFormatter("#tv-tyle");

// ⚠️ Ép chạy formatter ngay sau khi set value
const raw = tyleInput.value.replace(/[^\d]/g, "");
if (raw) {
  tyleInput.value = raw + " %";
}

  document.getElementById("tv-gioitinh").value = "nam";
  document.getElementById("tv-sotien").value = "";

  setTimeout(() => document.getElementById("tv-ten").focus(), 10);

  if (activeTourId) {
    switchTab(activeTourId);
  }
}

function onChangeTourInThemTv() {
  const tourId = document.getElementById("tv-tour-select").value;
  if (tourId) {
    switchTab(tourId);
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
  const gioiTinhSelect = document.getElementById("tv-gioitinh");
  const soTienInput = document.getElementById("tv-sotien");

  const tenRaw = tenInput.value.trim();
  const ten = capitalizeWords(tenRaw);
  const sdt = sdtInput.value.trim();

  // ✅ Tỉ lệ: loại bỏ mọi ký tự không phải số (%), rồi chia cho 100
  const rawTyLe = tyleInput.value.replace(/[^\d]/g, "");
  const tyle = parseInt(rawTyLe);
  const tyLeDong = isNaN(tyle) ? 1 : tyle / 100;

  const gioiTinh = gioiTinhSelect.value;

  // ✅ Số tiền: loại bỏ ký tự, chuyển thành số
  const rawTien = soTienInput.value.replace(/[^\d]/g, "");
  const soTien = parseInt(rawTien) || 0;

  if (!ten) {
    alert("Hãy nhập họ và tên thành viên.");
    return;
  }

  // ✅ Thêm thành viên
  db.run(`
    INSERT INTO ThanhVien (tv_tour_id, tv_ho_ten, tv_gioi_tinh, tv_sdt, tv_ty_le_dong)
    VALUES (?, ?, ?, ?, ?)
  `, [tourId, ten, gioiTinh, sdt, tyLeDong]);

  // ✅ Nếu có đóng góp ban đầu, thêm vào bảng DongGop
  if (soTien > 0) {
    const tvId = db.exec(`SELECT last_insert_rowid()`)[0].values[0][0];
    db.run(`
      INSERT INTO DongGop (dg_tour_id, dg_tv_id, dg_so_tien, dg_thoi_gian)
      VALUES (?, ?, ?, datetime('now', 'localtime'))
    `, [tourId, tvId, soTien]);
  }

  saveToLocal();
  loadTour(tourId, 1); // 👉 Quay lại tab Thành viên

  // ✅ Tên tour để hiển thị toast
  const tourSelect = document.getElementById("tv-tour-select");
  const tourTen = tourSelect.options[tourSelect.selectedIndex].textContent;

  showToast(`Đã thêm ${ten} vào tour ${tourTen}`, '', true, 'top');

  // ✅ Reset form
  tenInput.value = "";
  sdtInput.value = "";
  gioiTinhSelect.value = "nam";
  soTienInput.value = "";

  // ✅ Reset lại "100 %" cho tỷ lệ sau submit
  tyleInput.value = "100 %";

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

    // ✅ Gắn formatter sau khi form đã được nạp
    const tyleInput = document.getElementById("edit-tv-tyle");
    attachPercentageFormatter("#edit-tv-tyle");

    // ✅ Nếu đã có sẵn giá trị số thì ép format lại thành "xx %"
    const raw = tyleInput.value.replace(/[^\d]/g, "");
    if (raw) {
      tyleInput.value = raw + " %";
    }
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
  const tvId = document.getElementById("edit-tv-select").value;
  const result = db.exec(`SELECT tv_id, tv_ho_ten, tv_sdt, tv_ty_le_dong, tv_gioi_tinh FROM ThanhVien WHERE tv_id = ?`, [tvId]);
  const data = result[0]?.values[0];

  if (!data) return;

  document.getElementById("edit-tv-name").value = data[1];
  document.getElementById("edit-tv-sdt").value = data[2];

  const tyleInput = document.getElementById("edit-tv-tyle");

  // ✅ Tính tỷ lệ % từ giá trị gốc (0.75 → 75)
  const tyLeGoc = typeof data[3] === "number" ? data[3] : 1;
  const tyLePercent = Math.round(tyLeGoc * 100);

  // ✅ Gán giá trị và định dạng thành "75 %"
  tyleInput.value = tyLePercent + " %";

  document.getElementById("edit-tv-gioitinh").value = data[4];
}


function submitSuaThanhVien() {
  const tvId = document.getElementById("edit-tv-select").value;
  const rawName = document.getElementById("edit-tv-name").value.trim();
  const newName = capitalizeWords(rawName);
  const sdt = document.getElementById("edit-tv-sdt").value.trim();

  // ✅ Loại bỏ ký tự không phải số trong tỉ lệ (ví dụ: "85 %" -> 85)
  const tyleRaw = document.getElementById("edit-tv-tyle").value.replace(/[^\d]/g, "");
  const tyle = parseInt(tyleRaw);
  const tyLeDong = isNaN(tyle) ? 1 : tyle / 100;

  const gioiTinh = document.getElementById("edit-tv-gioitinh").value;
  const tourId = document.getElementById("edit-tv-tour").value;

  if (!newName) {
    alert("Hãy nhập họ và tên mới.");
    return;
  }

  // ✅ Lấy tên cũ trước khi sửa
  const result = db.exec(`SELECT tv_ho_ten FROM ThanhVien WHERE tv_id = ?`, [tvId]);
  const oldName = result[0]?.values[0]?.[0] || "thành viên";

  // ✅ Cập nhật thông tin thành viên
  db.run(`
    UPDATE ThanhVien
    SET tv_ho_ten = ?, tv_sdt = ?, tv_ty_le_dong = ?, tv_gioi_tinh = ?
    WHERE tv_id = ?
  `, [newName, sdt, tyLeDong, gioiTinh, tvId]);

  saveToLocal();
  closeSuaThanhVien();
  loadTour(tourId, 1); // 👉 quay lại tab Thành viên

  showToast(`Đã sửa ${oldName} thành ${newName}`, '', true);
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

  // Lấy tên thành viên trước khi xoá
  const result = db.exec(`SELECT tv_ho_ten FROM ThanhVien WHERE tv_id = ?`, [tvId]);
  const ten = result[0]?.values[0]?.[0] || "thành viên";

  // Lấy tên tour từ dropdown
  const tourSelect = document.getElementById("xoa-tv-tour");
  const tourTen = tourSelect.options[tourSelect.selectedIndex]?.textContent || "tour";

  // Xoá dữ liệu
  db.run(`DELETE FROM ThanhVien WHERE tv_id = ?`, [tvId]);
  db.run(`DELETE FROM DongGop WHERE dg_tv_id = ?`, [tvId]);

  saveToLocal();
  closeXoaThanhVien();
  loadTour(tourId, 1); // 👉 quay lại tab Thành viên

  // Hiển thị toast
  showToast(`Đã xoá ${ten} khỏi tour ${tourTen}`, '', true);
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

  // Ghi nhớ: sau khi lưu, chọn lại tab "Thu" (tab 2)
  if (activeTourId) {
    _nextSelectedSubTab = 2;
  }

  // Gọi đổi danh sách thành viên ban đầu
  onChangeTourInThu();

  // Reset các trường
  document.getElementById("thu-so-tien").value = "";
  document.getElementById("thu-thoi-gian").value = getLocalDatetimeInputValue();
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

  // ✅ Xử lý định dạng tiền
  const rawTien = document.getElementById("thu-so-tien").value.replace(/[^\d]/g, "");
  const soTien = parseInt(rawTien) || 0;

  const thoiGian = document.getElementById("thu-thoi-gian").value;
  const ghiChu = document.getElementById("thu-ghi-chu").value.trim();

  if (!tourId || !tvId || isNaN(soTien) || soTien <= 0 || !thoiGian) {
    alert("Vui lòng nhập đầy đủ thông tin hợp lệ.");
    return;
  }

  // ✅ Lấy tên thành viên
  const result = db.exec(`SELECT tv_ho_ten FROM ThanhVien WHERE tv_id = ?`, [tvId]);
  const ten = result[0]?.values[0]?.[0] || "thành viên";

  // ✅ Định dạng số tiền thành 500.000đ
  const formatted = soTien.toLocaleString("vi-VN") + "đ";

  // ✅ Thêm dòng đóng góp
  db.run(`
    INSERT INTO DongGop (dg_tour_id, dg_tv_id, dg_so_tien, dg_thoi_gian, dg_ghi_chu)
    VALUES (?, ?, ?, ?, ?)
  `, [tourId, tvId, soTien, thoiGian, ghiChu]);

  saveToLocal();
  closeThu();
  loadTour(tourId, 2); // chọn lại tab "Thu"

  // ✅ Hiển thị toast
  showToast(`Đã thu ${ten} ${formatted}`, '', true);
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

  loadDanhMucToSelect();

  // Ghi nhớ chọn tab Chi tiêu (tab 3)
  if (activeTourId) {
    _nextSelectedSubTab = 3;
  }

  // Reset form
  document.getElementById("chi-ten-khoan").value = "";
  document.getElementById("chi-so-tien").value = "";
  document.getElementById("chi-thoi-gian").value = getLocalDatetimeInputValue();
  document.getElementById("chi-ghi-chu").value = "";

  // ✅ Focus vào ô tên khoản chi
  document.getElementById("chi-ten-khoan").focus();
  document.getElementById("chi-ten-khoan").addEventListener("input", goiYDanhMucTuDong);
}


function closeChi() {
  document.getElementById("chiModal").style.display = "none";
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
    
    // ✅ Mặc định chọn "🧩 Chi phí khác"
    if (ten.includes("🧩 Chi phí khác")) {
      opt.selected = true;
    }

    select.appendChild(opt);
  });
}


function submitChi() {
  const tourId = document.getElementById("chi-tour-select").value;
  const tenKhoan = document.getElementById("chi-ten-khoan").value.trim();

  const rawTien = document.getElementById("chi-so-tien").value.replace(/[^\d]/g, "");
  const soTien = parseInt(rawTien) || 0;

  const thoiGian = document.getElementById("chi-thoi-gian").value;
  const ghiChu = document.getElementById("chi-ghi-chu").value.trim();
  const danhMucId = document.getElementById("chi-danh-muc-select").value;

  if (!tourId || !tenKhoan || isNaN(soTien) || soTien <= 0 || !thoiGian) {
    alert("Vui lòng nhập đầy đủ thông tin hợp lệ.");
    return;
  }

  db.run(`
    INSERT INTO ChiTieu (
      ct_tour_id, ct_thoi_gian, ct_ten_khoan,
      ct_so_tien, ct_danh_muc_id, ct_ghi_chu
    ) VALUES (?, ?, ?, ?, ?, ?)
  `, [
    tourId, thoiGian, tenKhoan,
    soTien, danhMucId || null, ghiChu
  ]);

  saveToLocal();
  closeChi();
  loadTour(tourId, 3); // 👉 quay lại tab Chi tiêu

  // ✅ Hiển thị toast
  const formatted = soTien.toLocaleString("vi-VN") + "đ";
  showToast(`Đã thêm khoản chi ${tenKhoan} ${formatted}`, '', true);
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

// Định dạng tiền kiểu Việt Nam, ví dụ: "100.000 đ"
function attachCurrencyFormatter(selector) {
  const input = document.querySelector(selector);
  if (!input) return;

  if (input.dataset.hasCurrencyListener) return;

  input.addEventListener("input", function (e) {
    const inputEl = this;
    const selectionStart = inputEl.selectionStart;

    // Lấy số thuần tuý từ chuỗi
    const raw = inputEl.value.replace(/[^\d]/g, "");

    if (!raw) {
      inputEl.value = "";
      return;
    }

    // Định dạng lại chuỗi số
    const formatted = Number(raw).toLocaleString("vi-VN") + " đ";

    // Tính chênh lệch độ dài chuỗi trước/sau định dạng
    const oldLength = inputEl.value.length;
    inputEl.value = formatted;
    const newLength = formatted.length;
    const diff = newLength - oldLength;

    // Cập nhật lại vị trí con trỏ gần nhất (nếu có thể)
    let newPos = selectionStart + diff;
    newPos = Math.min(newPos, inputEl.value.length - 2); // tránh chèn sau " đ"
    inputEl.setSelectionRange(newPos, newPos);
  });

  input.dataset.hasCurrencyListener = "true";
}

// Thêm ký tự % sau Tỷ lệ
function attachPercentageFormatter(selector) {
  const input = document.querySelector(selector);
  if (!input || input.dataset.hasPercentageListener) return;

  // Gắn sự kiện input
  input.addEventListener("input", function () {
    const raw = this.value.replace(/[^\d]/g, "");
    if (!raw) {
      this.value = "";
      return;
    }

    const formatted = raw + " %";

    const cursorPos = this.selectionStart;
    const prevLength = this.value.length;

    this.value = formatted;

    const nextLength = this.value.length;
    let newCursorPos = cursorPos + (nextLength - prevLength);
    newCursorPos = Math.min(newCursorPos, this.value.length - 2);
    this.setSelectionRange(newCursorPos, newCursorPos);
  });

  input.dataset.hasPercentageListener = "true";
}




// Hàm toast hỗ trợ IOS
function showToast(message, svgIcon = '', centered = false, position = 'bottom') {
  const toast = document.createElement('div');

  // Xác định vị trí top hoặc bottom
  const verticalPosition = position === 'top' ? 'top: 200px;' : 'bottom: 20px;';

  toast.innerHTML = `
    <div style="
      position: fixed;
      ${verticalPosition}
      left: 50%;
      transform: translateX(-50%);
      min-width: 300px;
      max-width: 90%;
      background: #212121;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      z-index: 9999;
      opacity: 1;
      transition: opacity 0.5s ease;
      ${centered ? 'text-align: center;' : 'display: flex; align-items: center; gap: 10px;'}
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
  }, 3000);
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

// Hàm lấy thời gian hiện tại của hệ thống
function getLocalDatetimeInputValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); // chuyển UTC → local
  return now.toISOString().slice(0, 16); // "yyyy-MM-ddTHH:mm"
}


// 🎯 Từ khoá gợi ý danh mục
const tuKhoaDanhMuc = {
  "🚗 Di chuyển": ["taxi", "grab", "xe", "xăng", "tàu", "máy bay", "ô tô", "bus", "đi lại", "di chuyển", "trạm", "cầu", "phà", "thuyền"],
  "🍜 Ăn uống": ["ăn", "uống", "cơm", "phở", "bún", "nước", "trà", "cà phê", "nhậu", "lẩu", "bánh", "hàng", "buffet"],
  "🛏️ Lưu trú": ["khách sạn", "nghỉ", "homestay", "resort", "phòng", "nhà"],
  "🎉 Giải trí": ["vé", "tham quan", "chơi", "game", "xem", "karaoke", "công viên", "bảo tàng", "safari"],
  "🧩 Chi phí khác": ["mua", "thuê", "khác", "chi thêm", "thuốc", "quà", "lưu niệm"]
};

// 🎯 Tự động gợi ý danh mục khi nhập tên khoản chi
function goiYDanhMucTuDong() {
  const tenKhoan = document.getElementById("chi-ten-khoan").value.toLowerCase();
  const select = document.getElementById("chi-danh-muc-select");

  let timThay = false;
  for (const [danhMuc, tuKhoaList] of Object.entries(tuKhoaDanhMuc)) {
    for (const tu of tuKhoaList) {
      if (tenKhoan.includes(tu)) {
        for (let i = 0; i < select.options.length; i++) {
          if (select.options[i].textContent === danhMuc) {
            select.selectedIndex = i;
            timThay = true;
            break;
          }
        }
        if (timThay) break;
      }
    }
    if (timThay) break;
  }
}

// Menu Thống kê
function goToThongKe() {
  const activeTab = document.querySelector(".tab-button.active");
  if (!activeTab) {
    location.href = "thongke.html";
    return;
  }

  const tourId = activeTab.dataset.tourId;
  location.href = `thongke.html?tourId=${tourId}`;
}
