const STUDENTS = [
  { id: 'vit-01', college: 'VIT Vellore', name: 'Aarav Khanna', initials: 'AK', email: 'aarav.khanna@vitstudent.ac.in', department: 'CSE', year: 'Final year', path: 'Data Analytics in the Wild', pathKey: 'analytics', enrolled: '12 Jun 2026', status: 'active', progress: 67, lastActive: 'Today', project: 'Retail Pulse', career: 82, tone: '' },
  { id: 'vit-02', college: 'VIT Vellore', name: 'Rhea Gupta', initials: 'RG', email: 'rhea.gupta@vitstudent.ac.in', department: 'IT', year: 'Final year', path: 'Data Analytics in the Wild', pathKey: 'analytics', enrolled: '03 May 2026', status: 'completed', progress: 92, lastActive: 'Yesterday', project: 'Campus Placement Pulse', career: 96, tone: 'teal' },
  { id: 'vit-03', college: 'VIT Vellore', name: 'Karthik Rao', initials: 'KR', email: 'karthik.rao@vitstudent.ac.in', department: 'CSE', year: 'Final year', path: 'Modern Web Development', pathKey: 'tech', enrolled: '18 Jun 2026', status: 'active', progress: 74, lastActive: '2 hours ago', project: 'Mintlify UI kit', career: 71, tone: 'mint' },
  { id: 'vit-04', college: 'VIT Vellore', name: 'Ananya Nair', initials: 'AN', email: 'ananya.nair@vitstudent.ac.in', department: 'ECE', year: 'Final year', path: 'Product Design Foundations', pathKey: 'design', enrolled: '21 Jun 2026', status: 'active', progress: 81, lastActive: 'Today', project: 'Student finance case study', career: 88, tone: 'lilac' },
  { id: 'vit-05', college: 'VIT Vellore', name: 'Meera Iyer', initials: 'MI', email: 'meera.iyer@vitstudent.ac.in', department: 'MBA', year: 'Final year', path: 'Business Analytics', pathKey: 'analytics', enrolled: '02 Jul 2026', status: 'at-risk', progress: 41, lastActive: '8 days ago', project: 'Offer-accept forecast', career: 36, tone: 'gold' },
  { id: 'vit-06', college: 'VIT Vellore', name: 'Dev Patel', initials: 'DP', email: 'dev.patel@vitstudent.ac.in', department: 'Mechanical', year: 'Final year', path: 'AI for Work', pathKey: 'tech', enrolled: '09 Jul 2026', status: 'at-risk', progress: 22, lastActive: '11 days ago', project: '—', career: 18, tone: '' },
  { id: 'vit-07', college: 'VIT Vellore', name: 'Isha Menon', initials: 'IM', email: 'isha.menon@vitstudent.ac.in', department: 'CSE', year: 'Final year', path: 'Modern Web Development', pathKey: 'tech', enrolled: '28 Jun 2026', status: 'active', progress: 58, lastActive: 'Yesterday', project: 'Placement portal revamp', career: 64, tone: 'teal' },
  { id: 'vit-08', college: 'VIT Vellore', name: 'Rohan Desai', initials: 'RD', email: 'rohan.desai@vitstudent.ac.in', department: 'ECE', year: 'Pre-final', path: 'Data Analytics in the Wild', pathKey: 'analytics', enrolled: '01 Sep 2026', status: 'invited', progress: 8, lastActive: 'Not started', project: '—', career: 12, tone: 'mint' },
  { id: 'vit-09', college: 'VIT Vellore', name: 'Sana Qureshi', initials: 'SQ', email: 'sana.qureshi@vitstudent.ac.in', department: 'IT', year: 'Final year', path: 'Product Design Foundations', pathKey: 'design', enrolled: '14 Jul 2026', status: 'active', progress: 70, lastActive: 'Today', project: 'Onboarding flow study', career: 77, tone: 'lilac' },
  { id: 'vit-10', college: 'VIT Vellore', name: 'Vikram Shah', initials: 'VS', email: 'vikram.shah@vitstudent.ac.in', department: 'CSE', year: 'Final year', path: 'AI for Work', pathKey: 'tech', enrolled: '11 Jun 2026', status: 'active', progress: 88, lastActive: 'Today', project: 'Resume review copilot', career: 84, tone: 'gold' },
  { id: 'vit-11', college: 'VIT Vellore', name: 'Priya Nambiar', initials: 'PN', email: 'priya.nambiar@vitstudent.ac.in', department: 'ECE', year: 'Final year', path: 'Business Analytics', pathKey: 'analytics', enrolled: '19 Jul 2026', status: 'at-risk', progress: 35, lastActive: '6 days ago', project: 'Drive conversion model', career: 29, tone: '' },
  { id: 'vit-12', college: 'VIT Vellore', name: 'Arjun Kale', initials: 'AK', email: 'arjun.kale@vitstudent.ac.in', department: 'IT', year: 'Final year', path: 'Data Analytics in the Wild', pathKey: 'analytics', enrolled: '07 Jun 2026', status: 'active', progress: 80, lastActive: 'Yesterday', project: 'Recruiter pulse board', career: 79, tone: 'teal' },
  { id: 'mit-01', college: 'MIT Pune', name: 'Neha Kulkarni', initials: 'NK', email: 'neha.kulkarni@mitpune.edu.in', department: 'CSE', year: 'Final year', path: 'Modern Web Development', pathKey: 'tech', enrolled: '16 Jun 2026', status: 'active', progress: 61, lastActive: 'Today', project: 'Alumni jobs board', career: 68, tone: 'lilac' },
  { id: 'mit-02', college: 'MIT Pune', name: 'Aditya Joshi', initials: 'AJ', email: 'aditya.joshi@mitpune.edu.in', department: 'IT', year: 'Final year', path: 'Data Analytics in the Wild', pathKey: 'analytics', enrolled: '22 Jun 2026', status: 'active', progress: 54, lastActive: 'Yesterday', project: 'Attendance insight', career: 59, tone: 'gold' },
  { id: 'mit-03', college: 'MIT Pune', name: 'Tanvi More', initials: 'TM', email: 'tanvi.more@mitpune.edu.in', department: 'ECE', year: 'Final year', path: 'Product Design Foundations', pathKey: 'design', enrolled: '04 Jul 2026', status: 'active', progress: 73, lastActive: 'Today', project: 'Lab booking app', career: 75, tone: 'mint' },
  { id: 'mit-04', college: 'MIT Pune', name: 'Harsh Pawar', initials: 'HP', email: 'harsh.pawar@mitpune.edu.in', department: 'MBA', year: 'Final year', path: 'Business Analytics', pathKey: 'analytics', enrolled: '29 Jul 2026', status: 'at-risk', progress: 28, lastActive: '9 days ago', project: '—', career: 21, tone: '' },
];

const filters = { path: 'all', department: 'all', status: 'all', query: '' };
const modal = document.getElementById('tpoModal');
const modalContent = document.getElementById('tpoModalContent');
const modalClose = document.getElementById('tpoModalClose');
const toast = document.getElementById('tpoToast');

function resolveCollege(raw) {
  const value = (raw || localStorage.getItem('gradflowTpoCollege') || 'VIT Vellore').trim();
  const key = value.toLowerCase();
  if (key.includes('mit') && !key.includes('vit')) return 'MIT Pune';
  if (key.includes('vit')) return 'VIT Vellore';
  return value || 'VIT Vellore';
}

const college = resolveCollege();
const tpoName = localStorage.getItem('gradflowTpoName') || 'Campus TPO';
const TONES = ['', 'teal', 'mint', 'lilac', 'gold'];
let collegeStudents = STUDENTS.filter((student) => student.college.toLowerCase() === college.toLowerCase());

document.getElementById('collegeHeading').textContent = college;
document.getElementById('collegeLock').textContent = college;
document.getElementById('sideCollege').textContent = college;
document.getElementById('tpoName').textContent = tpoName;
document.getElementById('tpoInitials').textContent = tpoName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'TP';

function showToast(title, detail) {
  toast.querySelector('strong').textContent = title;
  toast.querySelector('small').textContent = detail;
  toast.classList.add('show');
  clearTimeout(window.tpoToastTimer);
  window.tpoToastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
}

function openModal(content) {
  modalContent.innerHTML = content;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function visibleStudents() {
  const query = filters.query.toLowerCase();
  return collegeStudents.filter((student) => {
    const matchesPath = filters.path === 'all' || student.pathKey === filters.path;
    const matchesDept = filters.department === 'all' || student.department === filters.department;
    const matchesStatus = filters.status === 'all' || student.status === filters.status;
    const matchesQuery = !query || `${student.name} ${student.department} ${student.path} ${student.project}`.toLowerCase().includes(query);
    return matchesPath && matchesDept && matchesStatus && matchesQuery;
  });
}

function statusLabel(status) {
  return status.replace('-', ' ');
}

function renderKpis(rows) {
  const active = rows.filter((student) => student.status === 'active').length;
  const risk = rows.filter((student) => student.status === 'at-risk').length;
  const average = rows.length ? Math.round(rows.reduce((sum, student) => sum + student.progress, 0) / rows.length) : 0;
  document.getElementById('kpiEnrolled').textContent = String(rows.length);
  document.getElementById('kpiEnrolledHint').textContent = `From ${college}`;
  document.getElementById('kpiActive').textContent = String(active);
  document.getElementById('kpiActiveHint').textContent = rows.length ? `${Math.round((active / rows.length) * 100)}% of this view` : 'No matches';
  document.getElementById('kpiProgress').textContent = `${average}%`;
  document.getElementById('kpiRisk').textContent = String(risk);
  document.getElementById('sideReady').textContent = String(average || 0);
}

function renderEnrollment(rows) {
  const body = document.getElementById('enrollmentBody');
  const empty = document.getElementById('enrollmentEmpty');
  document.getElementById('enrollmentCount').textContent = `${rows.length} student${rows.length === 1 ? '' : 's'}`;
  body.replaceChildren();
  empty.hidden = rows.length > 0;
  rows.forEach((student) => {
    const row = document.createElement('tr');
    row.dataset.studentId = student.id;
    row.innerHTML = `
      <td>
        <div class="tpo-student">
          <span class="tpo-avatar ${student.tone}">${student.initials}</span>
          <span><strong>${student.name}</strong><small>${student.email}</small></span>
        </div>
      </td>
      <td>${student.department} · ${student.year}</td>
      <td>${student.path}</td>
      <td>${student.enrolled}</td>
      <td><span class="tpo-status ${student.status}">${statusLabel(student.status)}</span></td>`;
    body.appendChild(row);
  });
}

function renderProgress(rows) {
  const board = document.getElementById('progressBoard');
  const empty = document.getElementById('progressEmpty');
  board.replaceChildren();
  empty.hidden = rows.length > 0;
  rows.forEach((student) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'tpo-progress-card';
    card.dataset.studentId = student.id;
    card.innerHTML = `
      <div class="tpo-progress-card-top">
        <div class="tpo-student">
          <span class="tpo-avatar ${student.tone}">${student.initials}</span>
          <span><h3>${student.name}</h3><p>${student.path}</p></span>
        </div>
        <span class="tpo-status ${student.status}">${statusLabel(student.status)}</span>
      </div>
      <div class="progress-label"><span>COURSE PROGRESS</span><strong>${student.progress}%</strong></div>
      <div class="tpo-bar ${student.status === 'at-risk' ? 'risk' : ''}"><i style="width:${student.progress}%"></i></div>
      <div class="progress-meta">
        <span>Project · ${student.project}</span>
        <span>Career profile · ${student.career}%</span>
      </div>
      <div class="progress-meta"><span>Last active · ${student.lastActive}</span><span>${student.college}</span></div>`;
    board.appendChild(card);
  });
}

function render() {
  const rows = visibleStudents();
  renderKpis(rows);
  renderEnrollment(rows);
  renderProgress(rows);
}

function studentById(id) {
  return collegeStudents.find((student) => student.id === id);
}

function openStudent(id) {
  const student = studentById(id);
  if (!student) return;
  openModal(`
    <p class="mini-eyebrow">STUDENT FROM ${student.college.toUpperCase()}</p>
    <h2 id="tpoModalTitle">${student.name.split(' ')[0]}’s<br /><em>progress.</em></h2>
    <p>${student.path} · ${student.department} · ${student.year}</p>
    <div class="tpo-detail-grid">
      <div><small>ENROLLED</small><strong>${student.enrolled}</strong></div>
      <div><small>STATUS</small><strong>${statusLabel(student.status)}</strong></div>
      <div><small>COURSE PROGRESS</small><strong>${student.progress}%</strong></div>
      <div><small>CAREER PROFILE</small><strong>${student.career}%</strong></div>
      <div><small>PROJECT</small><strong>${student.project}</strong></div>
      <div><small>LAST ACTIVE</small><strong>${student.lastActive}</strong></div>
    </div>
    <p class="tpo-note">College email: ${student.email}. Payment details are never visible in the TPO workspace.</p>
    <button class="button button-lime" id="followUp" type="button">Flag for follow-up <span>→</span></button>
  `);
  document.getElementById('followUp').addEventListener('click', () => {
    closeModal();
    showToast('Follow-up noted.', `${student.name} was added to this week’s TPO list.`);
  });
}

document.querySelectorAll('.tpo-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    filters.path = chip.dataset.path;
    document.querySelectorAll('.tpo-chip').forEach((button) => button.classList.toggle('active', button === chip));
    render();
  });
});

document.getElementById('departmentFilter').addEventListener('change', (event) => {
  filters.department = event.target.value;
  render();
});

document.getElementById('statusFilter').addEventListener('change', (event) => {
  filters.status = event.target.value;
  render();
});

document.getElementById('studentSearch').addEventListener('input', (event) => {
  filters.query = event.target.value.trim();
  render();
});

document.getElementById('enrollmentBody').addEventListener('click', (event) => {
  const row = event.target.closest('tr');
  if (row?.dataset.studentId) openStudent(row.dataset.studentId);
});

document.getElementById('progressBoard').addEventListener('click', (event) => {
  const card = event.target.closest('[data-student-id]');
  if (card) openStudent(card.dataset.studentId);
});

document.getElementById('downloadReport').addEventListener('click', () => {
  const rows = visibleStudents();
  const header = ['Name', 'College', 'Department', 'Path', 'Enrolled', 'Status', 'Progress', 'Project', 'Career', 'Last active'];
  const csv = [header, ...rows.map((student) => [
    student.name, student.college, student.department, student.path, student.enrolled,
    student.status, `${student.progress}%`, student.project, `${student.career}%`, student.lastActive,
  ])].map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${college.replaceAll(' ', '-').toLowerCase()}-tpo-report.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('Report downloaded.', `${rows.length} ${college} students, no payment data included.`);
});

document.getElementById('helpButton').addEventListener('click', () => {
  openModal(`<p class="mini-eyebrow">TPO HELP</p><h2 id="tpoModalTitle">Your campus,<br /><em>clearly scoped.</em></h2><p>This workspace only lists students enrolled from ${college}. Use filters to find at-risk learners, then download a privacy-first report for your placement cell.</p><button class="button button-dark" id="helpStart" type="button">Got it <span>→</span></button>`);
  document.getElementById('helpStart').addEventListener('click', () => { closeModal(); showToast('Help closed.', 'Your college cohort is still in view.'); });
});

document.getElementById('noticeButton').addEventListener('click', () => {
  showToast('3 students need attention.', `At-risk learners from ${college} are highlighted in Progress.`);
});

document.addEventListener('click', (event) => {
  if (event.target === modal || event.target === modalClose) closeModal();
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });

const dashMenu = document.getElementById('dashMenu');
const sidebar = document.querySelector('.dash-sidebar');
dashMenu.addEventListener('click', () => sidebar.classList.toggle('open'));
document.querySelectorAll('.dash-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    sidebar.classList.remove('open');
    document.querySelectorAll('.dash-nav a').forEach((item) => item.classList.toggle('active', item === link));
  });
});

function pathKeyFromEnrollment(row) {
  const id = String(row.courseId || '').toLowerCase();
  const name = String(row.courseName || '').toLowerCase();
  if (id.includes('design') || name.includes('design')) return 'design';
  if (id.includes('web') || id.includes('ai') || name.includes('web') || name.includes('ai')) return 'tech';
  return 'analytics';
}

function formatEnrolled(iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function initialsFrom(name, email) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  const source = (name || email || 'ST').trim();
  return source.slice(0, 2).toUpperCase();
}

function studentFromRemote(row, index) {
  const email = String(row.studentEmail || '').trim();
  const name = String(row.studentName || email.split('@')[0] || 'Student').trim();
  return {
    id: `paid-${email}-${row.courseId}`,
    college,
    name,
    initials: initialsFrom(name, email),
    email,
    department: '—',
    year: 'Enrolled',
    path: row.courseName,
    pathKey: pathKeyFromEnrollment(row),
    enrolled: formatEnrolled(row.enrolledAt),
    status: 'active',
    progress: 8,
    lastActive: 'Just enrolled',
    project: '—',
    career: 12,
    tone: TONES[index % TONES.length],
  };
}

async function mergeRemoteEnrollments() {
  if (!window.GradflowEnrollment?.tpoEnrollments) return;
  try {
    const result = await window.GradflowEnrollment.tpoEnrollments(college);
    if (!result.ok) return;
    const remote = result.data.enrollments || [];
    remote.forEach((row, index) => {
      if (!row.paid || !row.studentEmail) return;
      const existing = collegeStudents.find((student) => student.email.toLowerCase() === String(row.studentEmail).toLowerCase());
      if (existing) {
        existing.path = row.courseName || existing.path;
        existing.pathKey = pathKeyFromEnrollment(row);
        existing.enrolled = formatEnrolled(row.enrolledAt);
        if (existing.status === 'invited') existing.status = 'active';
        return;
      }
      collegeStudents.push(studentFromRemote(row, collegeStudents.length + index));
    });
    render();
    if (collegeStudents.length === 0) {
      document.getElementById('kpiEnrolledHint').textContent = `No Gradflow enrollments from ${college} yet`;
    }
  } catch {
    // Keep the local college cohort if Supabase is not connected.
  }
}

if (collegeStudents.length === 0) {
  document.getElementById('kpiEnrolledHint').textContent = `No Gradflow enrollments from ${college} yet`;
}

render();
mergeRemoteEnrollments();
