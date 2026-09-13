const TPO_COLUMNS = 'id,student_email,student_name,college,course_id,course_name,paid,enrolled_at';

export function publicEnrollment(row) {
  if (!row) return null;
  return {
    studentEmail: row.student_email,
    studentName: row.student_name || '',
    college: row.college || '',
    courseId: row.course_id,
    courseName: row.course_name,
    paid: Boolean(row.paid),
    enrolledAt: row.enrolled_at,
  };
}

export function createSupabaseClient({ url, serviceRoleKey, fetchImpl = fetch }) {
  const root = String(url).replace(/\/+$/, '');

  async function request(path, { method = 'GET', headers = {}, body } = {}) {
    const response = await fetchImpl(`${root}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = data?.message || data?.error || 'Supabase request failed';
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  return {
    async getEnrollment(email, courseId) {
      const query = new URLSearchParams({
        student_email: `eq.${email}`,
        course_id: `eq.${courseId}`,
        select: TPO_COLUMNS,
        limit: '1',
      });
      const rows = await request(`enrollments?${query}`);
      return rows?.[0] || null;
    },

    async listByEmail(email) {
      const query = new URLSearchParams({
        student_email: `eq.${email}`,
        paid: 'eq.true',
        select: TPO_COLUMNS,
        order: 'enrolled_at.desc',
      });
      return request(`enrollments?${query}`);
    },

    async listByCollege(college) {
      const query = new URLSearchParams({
        college: `ilike.${college}`,
        paid: 'eq.true',
        select: TPO_COLUMNS,
        order: 'enrolled_at.desc',
      });
      return request(`tpo_enrollments?${query}`);
    },

    async upsertEnrollment(record) {
      return request('enrollments?on_conflict=student_email,course_id', {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: record,
      });
    },
  };
}
