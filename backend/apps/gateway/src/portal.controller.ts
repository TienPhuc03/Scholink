import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';

@ApiTags('Gateway Web Portal')
@Controller()
export class PortalController {
  @Get('portal')
  @ApiOperation({ summary: 'Giao diện Web Admin & Organizer Kanban (TV3 Backend)' })
  getPortal(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(this.renderHtml());
  }

  @Get('admin')
  getAdmin(@Res() res: Response) {
    res.redirect('/portal#admin');
  }

  @Get('organizer')
  getOrganizer(@Res() res: Response) {
    res.redirect('/portal#kanban');
  }

  private renderHtml(): string {
    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scholink — Admin & Organizer Portal</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(18, 24, 40, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --primary-glow: rgba(59, 130, 246, 0.35);
      --accent: #8b5cf6;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --font: 'Plus Jakarta Sans', sans-serif;
      --mono: 'JetBrains Mono', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      background-image: 
        radial-gradient(at 0% 0%, rgba(59, 130, 246, 0.12) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(139, 92, 246, 0.12) 0px, transparent 50%);
      color: var(--text);
      font-family: var(--font);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--card-border);
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 1.35rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, #60a5fa, #c084fc);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .badge {
      font-size: 0.7rem;
      padding: 0.2rem 0.5rem;
      border-radius: 999px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-blue { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); }
    .badge-green { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
    .badge-purple { background: rgba(139, 92, 246, 0.2); color: #a78bfa; border: 1px solid rgba(139, 92, 246, 0.4); }
    
    nav {
      display: flex;
      gap: 0.5rem;
    }
    .nav-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 0.55rem 1.1rem;
      border-radius: 8px;
      font-family: var(--font);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .nav-btn:hover {
      color: var(--text);
      background: rgba(255, 255, 255, 0.05);
    }
    .nav-btn.active {
      color: #fff;
      background: rgba(59, 130, 246, 0.2);
      border-color: rgba(59, 130, 246, 0.5);
      box-shadow: 0 0 12px var(--primary-glow);
    }

    main {
      flex: 1;
      padding: 2rem;
      max-width: 1440px;
      margin: 0 auto;
      width: 100%;
    }
    .tab-content { display: none; }
    .tab-content.active { display: block; animation: fadeIn 0.3s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

    .card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 1.5rem;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      margin-bottom: 1.5rem;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--card-border);
    }
    .card-title {
      font-size: 1.15rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .card-desc {
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-top: 0.25rem;
    }

    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
    @media (max-width: 900px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }

    /* Form controls */
    .form-group {
      margin-bottom: 1rem;
    }
    label {
      display: block;
      font-size: 0.825rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 0.35rem;
    }
    input, select, textarea {
      width: 100%;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 0.65rem 0.9rem;
      color: var(--text);
      font-family: var(--font);
      font-size: 0.9rem;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus, select:focus, textarea:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px var(--primary-glow);
    }
    .btn {
      background: var(--primary);
      color: #fff;
      border: none;
      padding: 0.65rem 1.25rem;
      border-radius: 8px;
      font-family: var(--font);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.2s;
    }
    .btn:hover { background: var(--primary-hover); transform: translateY(-1px); }
    .btn-success { background: var(--success); }
    .btn-success:hover { background: #059669; }
    .btn-danger { background: var(--danger); }
    .btn-danger:hover { background: #dc2626; }
    .btn-secondary { background: rgba(255, 255, 255, 0.1); border: 1px solid var(--card-border); }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.15); }
    .btn-sm { padding: 0.35rem 0.65rem; font-size: 0.775rem; }

    /* Kanban Board */
    .kanban-board {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 1rem;
      overflow-x: auto;
      padding-bottom: 1rem;
      min-height: 520px;
    }
    @media (max-width: 1200px) {
      .kanban-board { min-width: 1200px; }
    }
    .kanban-col {
      background: rgba(15, 23, 42, 0.45);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
    }
    .kanban-col-header {
      padding: 0.85rem;
      border-bottom: 1px solid var(--card-border);
      font-weight: 700;
      font-size: 0.85rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .kanban-col-count {
      background: rgba(255, 255, 255, 0.1);
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      font-size: 0.75rem;
    }
    .kanban-cards {
      padding: 0.75rem;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .kanban-card {
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 0.85rem;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      transition: all 0.2s;
    }
    .kanban-card:hover {
      border-color: rgba(59, 130, 246, 0.5);
      transform: translateY(-2px);
    }
    .card-meta {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.4rem;
      font-family: var(--mono);
    }
    .card-actions {
      margin-top: 0.65rem;
      display: flex;
      gap: 0.35rem;
      flex-wrap: wrap;
    }

    /* Table styles */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }
    th {
      text-align: left;
      padding: 0.75rem 1rem;
      background: rgba(15, 23, 42, 0.6);
      color: var(--text-muted);
      font-weight: 600;
      border-bottom: 1px solid var(--card-border);
    }
    td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }
    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    /* Chat UI */
    .chat-layout {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 1.25rem;
      height: 560px;
    }
    .chat-rooms {
      border-right: 1px solid var(--card-border);
      padding-right: 1rem;
      overflow-y: auto;
    }
    .room-item {
      padding: 0.75rem;
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 0.4rem;
      border: 1px solid transparent;
      transition: all 0.2s;
    }
    .room-item:hover { background: rgba(255, 255, 255, 0.05); }
    .room-item.active { background: rgba(59, 130, 246, 0.2); border-color: rgba(59, 130, 246, 0.4); }
    .chat-messages {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .message-stream {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      background: rgba(15, 23, 42, 0.3);
      border-radius: 8px;
    }
    .chat-bubble {
      max-width: 75%;
      padding: 0.65rem 0.9rem;
      border-radius: 12px;
      font-size: 0.875rem;
      line-height: 1.4;
    }
    .bubble-in {
      align-self: flex-start;
      background: rgba(30, 41, 59, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .bubble-out {
      align-self: flex-end;
      background: var(--primary);
      color: #fff;
    }
    .bubble-seq {
      font-size: 0.65rem;
      opacity: 0.7;
      font-family: var(--mono);
      margin-bottom: 0.2rem;
    }

    /* Logs & health */
    .health-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }
    .console-box {
      background: #050811;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 1rem;
      font-family: var(--mono);
      font-size: 0.8rem;
      color: #38bdf8;
      max-height: 180px;
      overflow-y: auto;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>

  <header>
    <div class="logo">
      <span>SCHOLINK</span>
      <span class="badge badge-purple">TV3 Backend Portal</span>
    </div>
    <nav>
      <button class="nav-btn active" onclick="switchTab('admin', this)">🏢 Admin Tổ Chức</button>
      <button class="nav-btn" onclick="switchTab('kanban', this)">📋 Kanban Organizer</button>
      <button class="nav-btn" onclick="switchTab('teams', this)">🤝 Đội Thi & Roster Freeze</button>
      <button class="nav-btn" onclick="switchTab('chat', this)">💬 Chat Monotonic Seq</button>
      <button class="nav-btn" onclick="switchTab('health', this)">🩺 Health & Topology</button>
    </nav>
  </header>

  <main>

    <!-- TAB 1: ADMIN ORGANIZATIONS (F15) -->
    <div id="tab-admin" class="tab-content active">
      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">🏢 Quản Trị Đơn Vị & Cấp Quyền Organizer (F15)</h2>
            <p class="card-desc">Tạo tổ chức cấp học bổng / ban tổ chức cuộc thi và phân quyền tài khoản Organizer.</p>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="loadOrganizations()">🔄 Tải lại</button>
        </div>

        <div class="grid-2">
          <div>
            <h3 style="font-size: 1rem; margin-bottom: 0.75rem;">➕ Tạo Đơn Vị Tổ Chức Mới</h3>
            <div class="form-group">
              <label>Tên Đơn Vị / Doanh Nghiệp *</label>
              <input type="text" id="orgName" placeholder="Ví dụ: Quỹ Đổi Mới Sáng Tạo VinAI Lab">
            </div>
            <div class="form-group">
              <label>Mã số thuế / Giấy phép</label>
              <input type="text" id="orgTax" placeholder="0101234567">
            </div>
            <div class="form-group">
              <label>Email Liên Hệ</label>
              <input type="email" id="orgEmail" placeholder="contact@vinai.io">
            </div>
            <div class="form-group">
              <label>Mô tả ngắn</label>
              <textarea id="orgDesc" rows="2" placeholder="Tổ chức tài trợ học bổng nghiên cứu trí tuệ nhân tạo"></textarea>
            </div>
            <button class="btn" onclick="createOrganization()">Tạo Tổ Chức</button>
          </div>

          <div>
            <h3 style="font-size: 1rem; margin-bottom: 0.75rem;">🔑 Cấp Quyền Organizer Cho Người Dùng</h3>
            <div class="form-group">
              <label>Chọn Tổ Chức *</label>
              <select id="assignOrgSelect">
                <option value="">-- Đang tải danh sách tổ chức... --</option>
              </select>
            </div>
            <div class="form-group">
              <label>Email Người Dùng Cần Cấp Quyền *</label>
              <input type="email" id="assignUserEmail" placeholder="organizer@scholink.edu.vn">
            </div>
            <div class="form-group">
              <label>Vai trò trong tổ chức</label>
              <select id="assignRoleSelect">
                <option value="ORGANIZER_ADMIN">Quản Trị Viên (ORGANIZER_ADMIN)</option>
                <option value="ORGANIZER_MEMBER">Thành Viên Tuyển Chọn (ORGANIZER_MEMBER)</option>
              </select>
            </div>
            <button class="btn btn-success" onclick="assignOrganizer()">Cấp Quyền Organizer</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title" style="margin-bottom: 1rem;">Danh Sách Tổ Chức Đã Đăng Ký</h3>
        <table>
          <thead>
            <tr>
              <th>Mã ID</th>
              <th>Tên Đơn Vị</th>
              <th>Email</th>
              <th>Mã Thuế</th>
              <th>Trạng Thái</th>
            </tr>
          </thead>
          <tbody id="orgListBody">
            <tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Đang tải dữ liệu...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 2: ORGANIZER KANBAN (F24) -->
    <div id="tab-kanban" class="tab-content">
      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">📋 Bảng Kanban Thẩm Định Hồ Sơ Ứng Tuyển (F24)</h2>
            <p class="card-desc">Organizer theo dõi và chuyển trạng thái hồ sơ ứng viên theo quy chuẩn SRS v3.2.</p>
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <select id="kanbanOpportunitySelect" style="width: 320px;" onchange="loadKanban()">
              <option value="opp_vinai_scholarship_2026">Học bổng Nghiên cứu VinAI 2026</option>
              <option value="opp_fpt_tech_scholarship_2026">Học bổng Nữ sinh FPT 2026</option>
              <option value="opp_scholink_ai_challenge_2026">Cuộc thi Scholink AI Challenge 2026</option>
            </select>
            <button class="btn btn-secondary btn-sm" onclick="loadKanban()">🔄 Tải lại</button>
          </div>
        </div>

        <div class="kanban-board">
          <div class="kanban-col">
            <div class="kanban-col-header" style="color: #60a5fa;">Mới nộp <span class="kanban-col-count" id="count-APPLIED">0</span></div>
            <div class="kanban-cards" id="col-APPLIED"></div>
          </div>
          <div class="kanban-col">
            <div class="kanban-col-header" style="color: #38bdf8;">Đang Thẩm Định <span class="kanban-col-count" id="count-REVIEWING">0</span></div>
            <div class="kanban-cards" id="col-REVIEWING"></div>
          </div>
          <div class="kanban-col">
            <div class="kanban-col-header" style="color: #c084fc;">Vòng Trong <span class="kanban-col-count" id="count-SHORTLISTED">0</span></div>
            <div class="kanban-cards" id="col-SHORTLISTED"></div>
          </div>
          <div class="kanban-col">
            <div class="kanban-col-header" style="color: #fbbf24;">Phỏng Vấn <span class="kanban-col-count" id="count-INTERVIEW">0</span></div>
            <div class="kanban-cards" id="col-INTERVIEW"></div>
          </div>
          <div class="kanban-col">
            <div class="kanban-col-header" style="color: #34d399;">Trúng Tuyển <span class="kanban-col-count" id="count-ACCEPTED">0</span></div>
            <div class="kanban-cards" id="col-ACCEPTED"></div>
          </div>
          <div class="kanban-col">
            <div class="kanban-col-header" style="color: #f87171;">Từ Chối <span class="kanban-col-count" id="count-REJECTED">0</span></div>
            <div class="kanban-cards" id="col-REJECTED"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 3: TEAMS, RECRUITMENT & ROSTER FREEZE (SCHOL-32 & SCHOL-33) -->
    <div id="tab-teams" class="tab-content">
      <!-- Persona Switcher -->
      <div class="card" style="background: rgba(30, 41, 59, 0.7); border-color: rgba(96, 165, 250, 0.3);">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 700;">
              👤 Chuyển Đổi Tài Khoản Kiểm Thử (Demo 3 Tài Khoản SCHOL-33)
            </div>
            <div style="margin-top: 0.3rem; font-size: 0.95rem; font-weight: 600;">
              Đang thao tác với tư cách: <span id="currentPersonaBadge" class="badge badge-blue">Đang tải...</span>
              <span id="currentPersonaEmail" style="color: var(--text-muted); font-family: var(--mono); font-size: 0.8rem; margin-left: 0.5rem;"></span>
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn btn-sm btn-secondary" id="btnPersona1" onclick="switchPersona('student@scholink.edu.vn', 'Student@2026', 'Trưởng Đội BK AI (usr_student_001)', this)">
              👑 Trưởng Đội (Student 1)
            </button>
            <button class="btn btn-sm btn-secondary" id="btnPersona2" onclick="switchPersona('applicant1@scholink.edu.vn', 'Student@2026', 'Ứng Viên A (usr_student_002)', this)">
              🙋 Ứng Viên A (Student 2)
            </button>
            <button class="btn btn-sm btn-secondary" id="btnPersona3" onclick="switchPersona('applicant2@scholink.edu.vn', 'Student@2026', 'Ứng Viên B (usr_student_003)', this)">
              🙋‍♂️ Ứng Viên B (Tranh Slot Cuối)
            </button>
          </div>
        </div>
      </div>

      <!-- Main Layout -->
      <div class="grid-2">
        <!-- Col 1: Form Tạo Đội & Roster Freeze -->
        <div>
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">➕ Tạo Đội Thi Mới (Scholink AI Challenge)</h2>
              <span class="badge badge-purple">Trưởng đội chiếm 1 slot</span>
            </div>
            <div class="form-group">
              <label>Tên Đội Thi *</label>
              <input type="text" id="teamName" placeholder="Ví dụ: AI Vision Innovators">
            </div>
            <div class="form-group">
              <label>Mô tả & Vị trí/Kỹ năng cần tuyển</label>
              <textarea id="teamDesc" rows="2" placeholder="Cần tuyển: 1 Computer Vision Engineer (PyTorch), 1 UI/UX"></textarea>
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label>Kích thước tối thiểu (minSize)</label>
                <input type="number" id="teamMin" value="2" min="1" max="10">
              </div>
              <div class="form-group">
                <label>Kích thước tối đa (maxSize)</label>
                <input type="number" id="teamMax" value="2" min="2" max="10">
              </div>
            </div>
            <button class="btn" id="btnCreateTeam" onclick="createTeam()">🚀 Tạo Đội Thi Mới</button>
          </div>

          <!-- Roster Freeze Module (F33) -->
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">🔒 Khóa Roster Freeze & Nộp Đội (F33)</h2>
              <span class="badge badge-blue">Lease 10 Phút</span>
            </div>
            <div class="form-group">
              <label>Chọn Đội Thi</label>
              <select id="freezeTeamSelect" onchange="showTeamDetails()">
                <option value="">-- Chọn đội thi để xem chi tiết --</option>
              </select>
            </div>
            <div id="teamDetailsBox" class="console-box" style="margin-bottom: 1rem;">Chưa chọn đội thi.</div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button class="btn btn-danger btn-sm" onclick="prepareSubmission()">🔒 Khóa Roster Freeze (10 phút)</button>
              <button class="btn btn-success btn-sm" onclick="submitConsentTeam()">✍️ Gửi Consent Thành Viên</button>
              <button class="btn btn-secondary btn-sm" onclick="abortSubmission()">🔓 Mở Khóa Đội (Abort)</button>
            </div>
          </div>
        </div>

        <!-- Col 2: Danh Sách Đội & Quản Lý JoinRequest (SCHOL-33) -->
        <div>
          <!-- Leader Join Request Review Box (Chỉ hiện khi là Trưởng Đội) -->
          <div class="card" id="leaderRequestCard" style="border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.05); display: none;">
            <div class="card-header">
              <div>
                <h2 class="card-title" style="color: #34d399;">📋 Yêu Cầu Xin Vào Đội (Dành Cho Trưởng Đội)</h2>
                <p class="card-desc" id="leaderRequestTeamDesc">Đội: Đang tải...</p>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="loadLeaderJoinRequests()">🔄 Làm mới</button>
            </div>
            <div id="leaderRequestsContainer">
              <div style="color: var(--text-muted); font-size: 0.85rem;">Đang kiểm tra yêu cầu xin gia nhập...</div>
            </div>
          </div>

          <!-- Team List Card -->
          <div class="card">
            <div class="card-header">
              <div>
                <h2 class="card-title">👥 Danh Sách Đội Thi Theo Cuộc Thi</h2>
                <p class="card-desc">Cập nhật số slot theo thời gian thực từ máy chủ.</p>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="loadTeams()">🔄 Tải lại</button>
            </div>
            <div id="teamsListContainer" style="display: flex; flex-direction: column; gap: 1rem;">
              <div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 2rem;">Đang tải danh sách đội thi...</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 4: CHAT MONOTONIC SEQ & OUTBOX (F24) -->
    <div id="tab-chat" class="tab-content">
      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">💬 Trò Chuyện Nhóm & Thứ Tự Tin Nhắn Seq Tuyệt Đối (F24)</h2>
            <p class="card-desc">Bảo toàn thứ tự tuần tự không gián đoạn (Monotonic Seq), chống gửi trùng ClientMsgId và Outbox pattern.</p>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="loadChatRooms()">🔄 Làm mới phòng</button>
        </div>

        <div class="chat-layout">
          <div class="chat-rooms" id="chatRoomsList">
            <div style="color: var(--text-muted); font-size: 0.85rem;">Đang tải danh sách phòng...</div>
          </div>

          <div class="chat-messages">
            <div class="message-stream" id="messageStream">
              <div style="color: var(--text-muted); text-align: center; margin: auto;">Chọn một phòng chat ở cột bên trái để bắt đầu.</div>
            </div>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
              <input type="text" id="chatInput" placeholder="Nhập tin nhắn kiểm thử thứ tự Seq..." onkeydown="if(event.key==='Enter') sendChatMessage()">
              <button class="btn" onclick="sendChatMessage()">Gửi Tin</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 5: HEALTH & TOPOLOGY (F06) -->
    <div id="tab-health" class="tab-content">
      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">🩺 Trạng Thái Hạ Tầng 5 Microservices (F06)</h2>
            <p class="card-desc">Topology Microservices Ecosystem phân tán kết nối qua API Gateway Port 3000.</p>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="checkHealth()">🔄 Kiểm tra lại</button>
        </div>

        <div class="grid-3" id="servicesHealthGrid">
          <div class="card" style="margin: 0; background: rgba(30, 41, 59, 0.4);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <strong>🚪 API Gateway</strong>
              <span class="health-pill"><span class="status-dot"></span> Port 3000</span>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted);">Reverse Proxy, Correlation ID & Swagger UI</p>
          </div>
          <div class="card" style="margin: 0; background: rgba(30, 41, 59, 0.4);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <strong>👤 Identity Service</strong>
              <span class="health-pill"><span class="status-dot"></span> Port 3001</span>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted);">Auth, Passport, Consent, Organizations</p>
          </div>
          <div class="card" style="margin: 0; background: rgba(30, 41, 59, 0.4);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <strong>🎓 Opportunity Service</strong>
              <span class="health-pill"><span class="status-dot"></span> Port 3002</span>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted);">Catalog, Cursor Filter, Applications, Kanban</p>
          </div>
          <div class="card" style="margin: 0; background: rgba(30, 41, 59, 0.4);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <strong>🤝 Collaboration Service</strong>
              <span class="health-pill"><span class="status-dot"></span> Port 3003</span>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted);">Atomic Team, Roster Freeze, Chat Seq & Outbox</p>
          </div>
          <div class="card" style="margin: 0; background: rgba(30, 41, 59, 0.4);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <strong>💳 Billing Service</strong>
              <span class="health-pill"><span class="status-dot"></span> Port 3004</span>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted);">Integer Wallet, Topup Sandbox, Purchase SKU</p>
          </div>
          <div class="card" style="margin: 0; background: rgba(30, 41, 59, 0.4);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <strong>🔔 Notification Service</strong>
              <span class="health-pill"><span class="status-dot"></span> Port 3005</span>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted);">In-app Mailbox, Deadline Reminders & MQTT</p>
          </div>
        </div>

        <div style="margin-top: 1.5rem;">
          <h4 style="font-size: 0.9rem; margin-bottom: 0.5rem;">Console Trạng Thái Hệ Thống</h4>
          <div id="healthConsole" class="console-box">Đang kết nối tới Gateway...</div>
        </div>
      </div>
    </div>

  </main>

  <script>
    let activeRoomId = null;
    let cachedTeams = [];
    let currentReservation = null;

    function switchTab(tabId, btn) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
      const target = document.getElementById('tab-' + tabId);
      if (target) target.classList.add('active');
      if (btn) btn.classList.add('active');

      if (tabId === 'admin') loadOrganizations();
      if (tabId === 'kanban') loadKanban();
      if (tabId === 'teams') loadTeams();
      if (tabId === 'chat') loadChatRooms();
      if (tabId === 'health') checkHealth();
    }

    // ==========================================
    // 1. ADMIN ORGANIZATIONS
    // ==========================================
    async function loadOrganizations() {
      try {
        const res = await fetch('/api/v1/admin/organizations');
        if (!res.ok) throw new Error('Không thể tải tổ chức (Mã: ' + res.status + ')');
        const orgs = await res.json();
        const tbody = document.getElementById('orgListBody');
        const select = document.getElementById('assignOrgSelect');

        if (!orgs || orgs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Chưa có đơn vị tổ chức nào. Hãy tạo mới bên trên.</td></tr>';
          select.innerHTML = '<option value="">-- Chưa có tổ chức nào --</option>';
          return;
        }

        tbody.innerHTML = orgs.map(o => \`
          <tr>
            <td style="font-family: var(--mono); font-size: 0.8rem; color: #60a5fa;">\${o.id}</td>
            <td><strong>\${o.name}</strong></td>
            <td>\${o.email || '—'}</td>
            <td>\${o.taxCode || '—'}</td>
            <td><span class="badge badge-green">\${o.status}</span></td>
          </tr>
        \`).join('');

        select.innerHTML = orgs.map(o => \`<option value="\${o.id}">\${o.name} (\${o.id})</option>\`).join('');
      } catch (err) {
        document.getElementById('orgListBody').innerHTML = \`<tr><td colspan="5" style="color: var(--danger); text-align: center;">\${err.message}</td></tr>\`;
      }
    }

    async function createOrganization() {
      const name = document.getElementById('orgName').value.trim();
      const taxCode = document.getElementById('orgTax').value.trim();
      const email = document.getElementById('orgEmail').value.trim();
      const description = document.getElementById('orgDesc').value.trim();

      if (!name) return alert('Vui lòng nhập tên đơn vị tổ chức');

      try {
        const res = await fetch('/api/v1/admin/organizations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, taxCode, email, description })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Lỗi tạo tổ chức');

        alert('✅ Đã tạo tổ chức thành công: ' + data.name);
        document.getElementById('orgName').value = '';
        document.getElementById('orgTax').value = '';
        document.getElementById('orgEmail').value = '';
        document.getElementById('orgDesc').value = '';
        loadOrganizations();
      } catch (err) {
        alert('❌ Lỗi: ' + err.message);
      }
    }

    async function assignOrganizer() {
      const orgId = document.getElementById('assignOrgSelect').value;
      const userEmail = document.getElementById('assignUserEmail').value.trim();
      const role = document.getElementById('assignRoleSelect').value;

      if (!orgId || !userEmail) return alert('Vui lòng chọn tổ chức và nhập email người dùng');

      try {
        const res = await fetch(\`/api/v1/admin/organizations/\${orgId}/assign-organizer\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userEmail, role })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Lỗi cấp quyền');

        alert('✅ ' + (data.message || 'Cấp quyền Organizer thành công!'));
        document.getElementById('assignUserEmail').value = '';
      } catch (err) {
        alert('❌ Lỗi: ' + err.message);
      }
    }

    // ==========================================
    // 2. KANBAN ORGANIZER (F24)
    // ==========================================
    async function loadKanban() {
      const oppId = document.getElementById('kanbanOpportunitySelect').value;
      try {
        const res = await fetch(\`/api/v1/applications/organizer/kanban/\${oppId}\`);
        if (!res.ok) throw new Error('Không thể tải dữ liệu Kanban');
        const data = await res.json();

        const cols = ['APPLIED', 'REVIEWING', 'SHORTLISTED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'];
        cols.forEach(col => {
          const list = data.columns[col] || [];
          document.getElementById('count-' + col).innerText = list.length;
          const container = document.getElementById('col-' + col);
          container.innerHTML = list.map(app => \`
            <div class="kanban-card">
              <div style="font-weight: 700; font-size: 0.85rem;">\${app.submissionType === 'TEAM' ? '👥 Đội thi' : '👤 Sinh viên'}</div>
              <div class="card-meta">ID: \${app.id.substring(0, 16)}...</div>
              <div class="card-meta">Profile ver: v\${app.profileVersion} | Rev: \${app.revision}</div>
              <div class="card-actions">
                \${col !== 'REVIEWING' ? \`<button class="btn btn-secondary btn-sm" onclick="moveKanban('\${app.id}', 'REVIEWING', \${app.version})">Duyệt</button>\` : ''}
                \${col !== 'SHORTLISTED' ? \`<button class="btn btn-secondary btn-sm" onclick="moveKanban('\${app.id}', 'SHORTLISTED', \${app.version})">Vòng trong</button>\` : ''}
                \${col !== 'ACCEPTED' ? \`<button class="btn btn-success btn-sm" onclick="moveKanban('\${app.id}', 'ACCEPTED', \${app.version})">Trúng tuyển</button>\` : ''}
                \${col !== 'REJECTED' ? \`<button class="btn btn-danger btn-sm" onclick="moveKanban('\${app.id}', 'REJECTED', \${app.version})">Loại</button>\` : ''}
              </div>
            </div>
          \`).join('');
        });
      } catch (err) {
        console.error(err);
      }
    }

    async function moveKanban(appId, status, expectedVersion) {
      try {
        const res = await fetch(\`/api/v1/applications/\${appId}/status\`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, expectedVersion })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Lỗi cập nhật');
        loadKanban();
      } catch (err) {
        alert('❌ Lỗi: ' + err.message);
      }
    }

    // ==========================================
    // 3. TEAMS, JOIN REQUESTS & DEMO (SCHOL-32 & SCHOL-33)
    // ==========================================
    let currentAuthToken = '';
    let currentUserId = 'usr_student_001';
    let currentUserName = 'Trưởng Đội BK AI (usr_student_001)';
    let currentLeaderTeam = null;

    async function switchPersona(email, password, name, btn) {
      document.querySelectorAll('#btnPersona1, #btnPersona2, #btnPersona3').forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-secondary');
      });
      if (btn) {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
      }

      const badge = document.getElementById('currentPersonaBadge');
      const emailSpan = document.getElementById('currentPersonaEmail');
      badge.innerText = 'Đang đăng nhập...';

      try {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Đăng nhập thất bại');

        currentAuthToken = data.accessToken;
        currentUserId = data.user.id;
        currentUserName = name;

        badge.innerText = name;
        emailSpan.innerText = '(' + email + ')';
        badge.className = 'badge badge-green';

        loadTeams();
      } catch (err) {
        badge.innerText = 'Lỗi xác thực';
        badge.className = 'badge badge-danger';
        alert('❌ Không thể đăng nhập Persona: ' + err.message);
      }
    }

    async function loadTeams() {
      const container = document.getElementById('teamsListContainer');
      const select = document.getElementById('freezeTeamSelect');
      if (!currentAuthToken) {
        // Tự động khởi tạo Persona 1 mặc định khi mở tab
        await switchPersona('student@scholink.edu.vn', 'Student@2026', 'Trưởng Đội BK AI (usr_student_001)', document.getElementById('btnPersona1'));
        return;
      }

      try {
        const res = await fetch('/api/v1/teams/competitions/opp_scholink_ai_challenge_2026');
        if (!res.ok) throw new Error('Không thể tải danh sách đội thi');
        cachedTeams = await res.json();

        // Update select for Roster Freeze
        select.innerHTML = '<option value="">-- Chọn đội thi để xem chi tiết --</option>' + 
          cachedTeams.map(t => \`<option value="\${t.id}">\${t.name} (Status: \${t.status}, Thành viên: \${t.members.length}/\${t.maxSize})</option>\`).join('');

        // Find if current user is leader of any team
        currentLeaderTeam = cachedTeams.find(t => t.leaderId === currentUserId);
        const leaderCard = document.getElementById('leaderRequestCard');
        if (currentLeaderTeam) {
          leaderCard.style.display = 'block';
          document.getElementById('leaderRequestTeamDesc').innerText = 'Đội: ' + currentLeaderTeam.name + ' (' + currentLeaderTeam.members.length + '/' + currentLeaderTeam.maxSize + ' thành viên)';
          loadLeaderJoinRequests();
        } else {
          leaderCard.style.display = 'none';
        }

        if (!cachedTeams || cachedTeams.length === 0) {
          container.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 2rem;">Chưa có đội thi nào. Hãy tạo đội mới bên trái!</div>';
          return;
        }

        container.innerHTML = cachedTeams.map(team => {
          const isMember = team.members.some(m => m.studentId === currentUserId);
          const isLeader = team.leaderId === currentUserId;
          const isFull = team.members.length >= team.maxSize;
          const isSubmitting = team.status === 'SUBMITTING' || team.status === 'SUBMITTED';

          let actionBtnHtml = '';
          if (isLeader) {
            actionBtnHtml = '<span class="badge badge-purple">👑 Bạn là Trưởng đội</span>';
          } else if (isMember) {
            actionBtnHtml = '<span class="badge badge-green" style="margin-right: 0.5rem;">✅ Thành viên</span>' +
              '<button class="btn btn-danger btn-sm" onclick="leaveTeam(\'' + team.id + '\')">Rời Đội</button>';
          } else if (isFull) {
            actionBtnHtml = '<span class="badge badge-danger">🔒 Đã đủ slot (' + team.members.length + '/' + team.maxSize + ')</span>';
          } else if (isSubmitting) {
            actionBtnHtml = '<span class="badge badge-blue">⏳ Đang nộp hồ sơ</span>';
          } else {
            actionBtnHtml = '<button class="btn btn-sm" style="background: linear-gradient(135deg, #3b82f6, #8b5cf6);" onclick="sendJoinRequestPrompt(\'' + team.id + '\', \'' + team.name + '\')">' +
              '➕ Xin Vào Đội' +
              '</button>';
          }

          const membersListHtml = team.members.map(m => 
            '<span style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; background: rgba(255,255,255,0.06); font-family: var(--mono);">' +
              (m.role === 'LEADER' ? '👑 ' : '👤 ') + m.studentId + ' (' + m.role + ')' +
            '</span>'
          ).join(' ');

          return '<div class="card" style="margin-bottom: 0; background: rgba(15, 23, 42, 0.6); border-color: ' + (isLeader ? 'rgba(139, 92, 246, 0.5)' : 'var(--card-border)') + ';">' +
            '<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">' +
              '<div>' +
                '<div style="display: flex; align-items: center; gap: 0.5rem;">' +
                  '<strong style="font-size: 1.05rem;">' + team.name + '</strong>' +
                  '<span class="badge ' + (team.status === 'FORMING' ? 'badge-blue' : (team.status === 'ACTIVE' ? 'badge-green' : 'badge-purple')) + '">' + team.status + '</span>' +
                '</div>' +
                '<div style="font-size: 0.85rem; color: var(--text-muted); margin: 0.35rem 0;">' +
                  (team.description || 'Chưa có mô tả mục tiêu.') +
                '</div>' +
                '<div style="font-size: 0.8rem; color: #60a5fa; margin-bottom: 0.5rem;">' +
                  '🎯 Slots: <strong>' + team.members.length + '/' + team.maxSize + '</strong> (Yêu cầu min: ' + team.minSize + ')' +
                '</div>' +
                '<div style="display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center;">' +
                  '<span style="font-size: 0.75rem; color: var(--text-muted);">Thành viên:</span>' +
                  membersListHtml +
                '</div>' +
              '</div>' +
              '<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">' +
                actionBtnHtml +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('');

      } catch (err) {
        container.innerHTML = '<div style="color: var(--danger); text-align: center; padding: 1rem;">' + err.message + '</div>';
      }
    }

    async function sendJoinRequestPrompt(teamId, teamName) {
      if (!currentAuthToken) return alert('Vui lòng chọn tài khoản kiểm thử Persona trước!');
      const message = prompt('Nhập lời nhắn xin gia nhập đội [' + teamName + ']:', 'Em chào anh, em muốn tham gia mảng Computer Vision');
      if (message === null) return;

      try {
        const res = await fetch('/api/v1/teams/' + teamId + '/join-requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + currentAuthToken,
            'Idempotency-Key': 'idemp_' + Date.now()
          },
          body: JSON.stringify({ message })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.message || 'Lỗi gửi yêu cầu gia nhập');
        }
        alert('✅ Đã gửi yêu cầu gia nhập thành công tới đội [' + teamName + ']!');
        loadTeams();
      } catch (err) {
        alert('❌ Lỗi: ' + err.message);
      }
    }

    async function loadLeaderJoinRequests() {
      if (!currentLeaderTeam || !currentAuthToken) return;
      const container = document.getElementById('leaderRequestsContainer');
      try {
        const res = await fetch('/api/v1/teams/' + currentLeaderTeam.id + '/join-requests', {
          headers: { 'Authorization': 'Bearer ' + currentAuthToken }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Không thể tải yêu cầu');

        const pendingRequests = data.filter(r => r.status === 'PENDING');
        if (!pendingRequests || pendingRequests.length === 0) {
          container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 0.5rem 0;">Hiện không có yêu cầu nào đang chờ duyệt.</div>';
          return;
        }

        container.innerHTML = pendingRequests.map(r => 
          '<div style="background: rgba(15, 23, 42, 0.7); border: 1px solid var(--card-border); border-radius: 8px; padding: 0.75rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">' +
            '<div>' +
              '<div style="font-weight: 700; font-size: 0.85rem; color: #38bdf8;">👤 ' + r.applicantId + '</div>' +
              '<div style="font-size: 0.8rem; color: var(--text); margin: 0.2rem 0;">"' + (r.message || 'Không có lời nhắn') + '"</div>' +
              '<div style="font-size: 0.7rem; color: var(--text-muted); font-family: var(--mono);">' + new Date(r.appliedAt).toLocaleString('vi-VN') + '</div>' +
            '</div>' +
            '<div style="display: flex; gap: 0.4rem;">' +
              '<button class="btn btn-success btn-sm" id="btnAccept_' + r.id + '" onclick="reviewJoinRequest(\'' + currentLeaderTeam.id + '\', \'' + r.id + '\', \'ACCEPT\', this)">' +
                '✅ Duyệt Vào Đội' +
              '</button>' +
              '<button class="btn btn-danger btn-sm" id="btnReject_' + r.id + '" onclick="reviewJoinRequest(\'' + currentLeaderTeam.id + '\', \'' + r.id + '\', \'REJECT\', this)">' +
                '❌ Từ Chối' +
              '</button>' +
            '</div>' +
          '</div>'
        ).join('');
      } catch (err) {
        container.innerHTML = '<div style="color: var(--danger); font-size: 0.85rem;">' + err.message + '</div>';
      }
    }

    async function reviewJoinRequest(teamId, requestId, decision, btn) {
      if (!currentAuthToken) return alert('Vui lòng chọn tài khoản trưởng đội!');
      if (btn) {
        btn.disabled = true;
        btn.innerText = 'Đang xử lý...';
      }

      try {
        const res = await fetch('/api/v1/teams/' + teamId + '/join-requests/' + requestId + '/review', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + currentAuthToken,
            'Idempotency-Key': 'idemp_review_' + Date.now()
          },
          body: JSON.stringify({ decision })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.message || 'Lỗi xử lý yêu cầu gia nhập');
        }

        alert('✅ Đã ' + (decision === 'ACCEPT' ? 'DUYỆT THÀNH VIÊN VÀO ĐỘI' : 'TỪ CHỐI YÊU CẦU') + ' thành công!');
        loadTeams();
      } catch (err) {
        alert('❌ Lỗi: ' + err.message);
        if (btn) {
          btn.disabled = false;
          btn.innerText = decision === 'ACCEPT' ? '✅ Duyệt Vào Đội' : '❌ Từ Chối';
        }
      }
    }

    async function leaveTeam(teamId) {
      if (!currentAuthToken) return alert('Vui lòng chọn tài khoản kiểm thử!');
      if (!confirm('Bạn có chắc chắn muốn rời đội thi này không?')) return;

      try {
        const res = await fetch('/api/v1/teams/' + teamId + '/leave', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + currentAuthToken,
            'Idempotency-Key': 'idemp_leave_' + Date.now()
          }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Lỗi rời đội');

        alert('✅ Đã rời đội thi thành công!');
        loadTeams();
      } catch (err) {
        alert('❌ Lỗi: ' + err.message);
      }
    }

    async function createTeam() {
      if (!currentAuthToken) return alert('Vui lòng chọn tài khoản kiểm thử trước!');
      const name = document.getElementById('teamName').value.trim();
      const description = document.getElementById('teamDesc').value.trim();
      const minSize = parseInt(document.getElementById('teamMin').value, 10);
      const maxSize = parseInt(document.getElementById('teamMax').value, 10);

      if (!name) return alert('Vui lòng nhập tên đội thi');
      const btn = document.getElementById('btnCreateTeam');
      btn.disabled = true;
      btn.innerText = 'Đang tạo đội...';

      try {
        const res = await fetch('/api/v1/teams', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + currentAuthToken,
            'Idempotency-Key': 'idemp_create_' + Date.now()
          },
          body: JSON.stringify({
            competitionId: 'opp_scholink_ai_challenge_2026',
            name,
            description,
            minSize,
            maxSize
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Lỗi tạo đội');

        alert('✅ Đã tạo đội thành công: ' + data.name);
        document.getElementById('teamName').value = '';
        document.getElementById('teamDesc').value = '';
        loadTeams();
      } catch (err) {
        alert('❌ Lỗi: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerText = '🚀 Tạo Đội Thi Mới';
      }
    }

    function showTeamDetails() {
      const teamId = document.getElementById('freezeTeamSelect').value;
      const team = cachedTeams.find(t => t.id === teamId);
      const box = document.getElementById('teamDetailsBox');
      if (!team) {
        box.innerText = 'Chưa chọn đội thi.';
        return;
      }
      box.innerText = JSON.stringify({
        id: team.id,
        name: team.name,
        leaderId: team.leaderId,
        status: team.status,
        rosterVersion: team.rosterVersion,
        fencingToken: team.fencingToken,
        membersCount: team.members.length,
        members: team.members,
        currentReservationId: team.currentReservationId
      }, null, 2);
    }

    async function prepareSubmission() {
      const teamId = document.getElementById('freezeTeamSelect').value;
      if (!teamId) return alert('Vui lòng chọn đội thi trước');
      if (!currentAuthToken) return alert('Vui lòng chọn tài khoản kiểm thử!');

      try {
        const res = await fetch('/api/v1/teams/' + teamId + '/prepare-submission', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + currentAuthToken,
            'Idempotency-Key': 'idemp_freeze_' + Date.now()
          }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Lỗi chuẩn bị nộp');

        currentReservation = data;
        alert('🔒 Đã Khóa Roster Freeze thành công!\nReservation ID: ' + data.reservationId + '\nFencing Token: ' + data.fencingToken + '\nThời hạn Lease: 10 phút');
        loadTeams();
      } catch (err) {
        alert('❌ Lỗi: ' + err.message);
      }
    }

    async function submitConsentTeam() {
      if (!currentReservation) return alert('Chưa có Reservation nào đang chuẩn bị nộp');
      if (!currentAuthToken) return alert('Vui lòng chọn tài khoản kiểm thử!');
      try {
        const res = await fetch('/api/v1/teams/submissions/' + currentReservation.reservationId + '/consents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + currentAuthToken,
            'Idempotency-Key': 'idemp_consent_' + Date.now()
          },
          body: JSON.stringify({
            snapshotId: 'snp_demo_2026',
            payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Lỗi gửi consent');
        alert('✍️ Ghi nhận Consent thành công! (' + data.consentsCount + '/' + data.totalMembers + ' thành viên đã ký). Đủ điều kiện: ' + (data.hasAllConsents ? 'CÓ' : 'CHƯA'));
      } catch (err) {
        alert('❌ Lỗi: ' + err.message);
      }
    }

    async function abortSubmission() {
      if (!currentReservation) return alert('Chưa có Reservation nào');
      if (!currentAuthToken) return alert('Vui lòng chọn tài khoản kiểm thử!');
      try {
        const res = await fetch('/api/v1/teams/submissions/' + currentReservation.reservationId + '/abort', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + currentAuthToken,
            'Idempotency-Key': 'idemp_abort_' + Date.now()
          }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Lỗi hủy nộp');
        alert('🔓 Đã giải phóng Roster Freeze cho đội!');
        currentReservation = null;
        loadTeams();
      } catch (err) {
        alert('❌ Lỗi: ' + err.message);
      }
    }

    // ==========================================
    // 4. CHAT MONOTONIC SEQ (F24)
    // ==========================================
    async function loadChatRooms() {
      try {
        const res = await fetch('/api/v1/chats/rooms');
        if (!res.ok) throw new Error('Không thể tải phòng chat');
        const rooms = await res.json();
        const list = document.getElementById('chatRoomsList');

        if (!rooms || rooms.length === 0) {
          list.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">Chưa có phòng chat. Hãy tạo đội thi để tự sinh phòng.</div>';
          return;
        }

        list.innerHTML = rooms.map(r => \`
          <div class="room-item \${activeRoomId === r.id ? 'active' : ''}" onclick="selectRoom('\${r.id}')">
            <div style="font-weight: 700; font-size: 0.875rem;">\${r.type === 'TEAM' ? '👥 Phòng Đội Thi' : '💬 Chat 1-1'}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--mono);">Seq: #\${r.lastSeq}</div>
            <div style="font-size: 0.8rem; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">\${r.lastMessageSnippet || 'Chưa có tin nhắn'}</div>
          </div>
        \`).join('');

        if (!activeRoomId && rooms.length > 0) selectRoom(rooms[0].id);
      } catch (err) {
        console.error(err);
      }
    }

    async function selectRoom(roomId) {
      activeRoomId = roomId;
      document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
      const activeItem = document.querySelector(\`[onclick="selectRoom('\${roomId}')"]\`);
      if (activeItem) activeItem.classList.add('active');

      try {
        const res = await fetch(\`/api/v1/chats/rooms/\${roomId}/messages?limit=50\`);
        if (!res.ok) throw new Error('Lỗi tải tin nhắn');
        const data = await res.json();
        const stream = document.getElementById('messageStream');

        if (!data.messages || data.messages.length === 0) {
          stream.innerHTML = '<div style="color: var(--text-muted); text-align: center; margin: auto;">Chưa có tin nhắn nào trong phòng này. Hãy gửi tin nhắn đầu tiên!</div>';
          return;
        }

        stream.innerHTML = data.messages.map(m => \`
          <div class="chat-bubble bubble-in">
            <div class="bubble-seq">Seq: #\${m.seq} | Từ: \${m.senderId}</div>
            <div>\${m.content}</div>
          </div>
        \`).join('');
        stream.scrollTop = stream.scrollHeight;
      } catch (err) {
        console.error(err);
      }
    }

    async function sendChatMessage() {
      if (!activeRoomId) return alert('Vui lòng chọn phòng chat');
      const input = document.getElementById('chatInput');
      const content = input.value.trim();
      if (!content) return;

      const clientMsgId = 'cmsg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

      try {
        const res = await fetch(\`/api/v1/chats/rooms/\${activeRoomId}/messages\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, clientMsgId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Lỗi gửi tin');

        input.value = '';
        selectRoom(activeRoomId);
        loadChatRooms();
      } catch (err) {
        alert('❌ Lỗi: ' + err.message);
      }
    }

    // ==========================================
    // 5. HEALTH CHECK (F06)
    // ==========================================
    async function checkHealth() {
      try {
        const res = await fetch('/health');
        const data = await res.json();
        document.getElementById('healthConsole').innerText = JSON.stringify(data, null, 2);
      } catch (err) {
        document.getElementById('healthConsole').innerText = 'Lỗi kết nối Gateway: ' + err.message;
      }
    }

    // Init
    loadOrganizations();
  </script>
</body>
</html>`;
  }
}
