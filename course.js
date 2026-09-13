const params = new URLSearchParams(window.location.search);
let course = window.GradflowEnrollment.courseById(params.get('course'))
  || window.GradflowEnrollment.courseByName(params.get('course'));
const lockedState = document.getElementById('lockedState');
const unlockedState = document.getElementById('unlockedState');
const missingState = document.getElementById('missingState');
const toast = document.getElementById('courseToast');
const payButton = document.getElementById('payButton');
const payNote = document.getElementById('payNote');
let toastTimer;
let paymentsReady = false;

function showToast(title, detail) {
  toast.querySelector('strong').textContent = title;
  toast.querySelector('small').textContent = detail;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
}

function setPayBusy(busy, label) {
  if (!payButton) return;
  payButton.disabled = busy || !paymentsReady;
  payButton.textContent = label;
}

function renderUnlocked() {
  const record = window.GradflowEnrollment.studentEnrollments()[course.id];
  document.title = `${course.name} — Gradflow`;
  document.getElementById('openTitle').innerHTML = `${course.name.replace(' ', '<br />')}`;
  document.getElementById('openBlurb').textContent = `${course.blurb} Your project: ${course.project}.`;
  if (record?.enrolledAt) {
    const enrolledOn = new Date(record.enrolledAt);
    document.getElementById('enrolledOn').textContent = `Enrolled ${enrolledOn.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  const modules = document.getElementById('moduleList');
  modules.replaceChildren();
  (course.modules || []).forEach((module) => {
    const item = document.createElement('li');
    item.innerHTML = `<b>${module.number}</b><span>${module.title}</span><span>${module.time}</span>`;
    modules.appendChild(item);
  });
  const lesson = course.lesson || {};
  document.getElementById('lessonType').textContent = `${lesson.type || 'LESSON'} · MODULE ${lesson.number || ''}`;
  document.getElementById('lessonTitle').textContent = lesson.title || course.name;
  document.getElementById('lessonCopy').textContent = lesson.copy || course.blurb || '';
  document.getElementById('lessonTime').textContent = `${lesson.minutes || 0} min · ${(course.tools || []).join(' · ')}`;
  fillMedia('lessonMedia', lesson.videoUrl || course.promoVideoUrl, lesson.imageUrl || course.coverImageUrl);
  const resource = document.getElementById('lessonResource');
  if (lesson.resourceUrl) {
    resource.hidden = false;
    resource.innerHTML = `<a class="arrow-link" href="${lesson.resourceUrl}" target="_blank" rel="noreferrer">${lesson.resourceLabel || 'Download resource'} <span>↗</span></a>`;
  } else {
    resource.hidden = true;
    resource.replaceChildren();
  }
  lockedState.hidden = true;
  unlockedState.hidden = false;
  missingState.hidden = true;
}

function renderLocked(config = {}) {
  paymentsReady = Boolean(config.paymentsReady);
  document.title = `Locked · ${course.name} — Gradflow`;
  document.getElementById('lockedTitle').innerHTML = `Unlock <em>${course.name}</em>`;
  document.getElementById('lockedBlurb').textContent = `${course.blurb} Enroll to open the syllabus, current lesson, and ${course.project}.`;
  document.getElementById('lockedPrice').textContent = window.GradflowEnrollment.formatPrice(course.price);
  document.getElementById('lockedMeta').textContent = `${course.weeks} weeks · ${course.tools.join(' · ')}`;
  fillMedia('lockedMedia', course.promoVideoUrl, course.coverImageUrl || course.thumbnailUrl);
  const email = window.GradflowEnrollment.getStudentEmail();
  const college = window.GradflowEnrollment.getStudentCollege();
  if (email) document.getElementById('enrollEmail').value = email;
  if (college) document.getElementById('enrollCollege').value = college;
  if (paymentsReady) {
    payNote.textContent = `${config.mode === 'test' ? 'Razorpay test mode. ' : ''}Checkout opens with Razorpay. Card details stay with Razorpay. TPOs never see payment data.`;
    setPayBusy(false, `Pay ${window.GradflowEnrollment.formatPrice(course.price)} and enroll`);
  } else {
    payNote.textContent = 'Supabase and Razorpay keys are not connected yet. The course stays locked until payment can be verified. TPOs never see payment data.';
    setPayBusy(true, 'Payments not connected yet');
  }
  lockedState.hidden = false;
  unlockedState.hidden = true;
  missingState.hidden = true;
}

async function finishEnrollment(record) {
  window.GradflowEnrollment.cacheEnrollment(record);
  renderUnlocked();
  showToast('Payment verified.', `${course.name} is unlocked. TPOs never see this payment.`);
  unlockedState.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function fillMedia(id, videoUrl, imageUrl) {
  const node = document.getElementById(id);
  if (!node) return;
  node.replaceChildren();
  if (videoUrl) {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.controls = true;
    video.playsInline = true;
    node.appendChild(video);
    node.hidden = false;
    return;
  }
  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = '';
    node.appendChild(image);
    node.hidden = false;
    return;
  }
  node.hidden = true;
}

async function loadPreviewCourse(id) {
  const response = await fetch(`/api/catalog-course?id=${encodeURIComponent(id)}&preview=1`, {
    credentials: 'same-origin',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.course) return null;
  return { ...data.course, preview: Boolean(data.preview) };
}

async function boot() {
  await window.GradflowEnrollment.loadPublishedCatalog();
  course = window.GradflowEnrollment.courseById(params.get('course'))
    || window.GradflowEnrollment.courseByName(params.get('course'));
  if (params.get('preview') === '1' && params.get('course')) {
    const preview = await loadPreviewCourse(params.get('course'));
    if (preview) course = preview;
  }
  if (!course) {
    missingState.hidden = false;
    lockedState.hidden = true;
    unlockedState.hidden = true;
    return;
  }

  const [config] = await Promise.all([
    window.GradflowEnrollment.publicConfig(),
    window.GradflowEnrollment.refreshFromServer(),
  ]);

  if (course.preview) {
    renderUnlocked();
    showToast('Admin preview.', 'Draft courses stay hidden from students until you publish.');
    return;
  }
  if (window.GradflowEnrollment.isEnrolled(course.id)) {
    renderUnlocked();
    return;
  }
  renderLocked(config);
}

document.getElementById('enrollForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!course || !paymentsReady) return;

  const email = document.getElementById('enrollEmail').value.trim();
  const college = document.getElementById('enrollCollege').value.trim();
  if (!email || !college) return;

  window.GradflowEnrollment.setStudentEmail(email);
  window.GradflowEnrollment.setStudentCollege(college);
  setPayBusy(true, 'Creating Razorpay order…');

  try {
    const orderResult = await window.GradflowEnrollment.createOrder({
      courseId: course.id,
      email,
      college,
    });

    if (orderResult.status === 409 && orderResult.data.enrollment?.paid) {
      await finishEnrollment(orderResult.data.enrollment);
      return;
    }
    if (!orderResult.ok) {
      throw new Error(orderResult.data.error || 'Could not create a Razorpay order.');
    }

    const RazorpayCheckout = await window.GradflowEnrollment.loadRazorpay();
    const checkout = new RazorpayCheckout({
      key: orderResult.data.keyId,
      amount: orderResult.data.amount,
      currency: orderResult.data.currency,
      name: orderResult.data.checkoutName || 'Gradflow',
      description: course.name,
      order_id: orderResult.data.orderId,
      prefill: { email },
      notes: { courseId: course.id, college },
      theme: { color: '#0b2923' },
      handler: async (response) => {
        setPayBusy(true, 'Verifying payment…');
        try {
          const verifyResult = await window.GradflowEnrollment.verifyPayment({
            email,
            college,
            courseId: course.id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          if (!verifyResult.ok || !verifyResult.data.enrollment?.paid) {
            throw new Error(verifyResult.data.error || 'Payment could not be verified.');
          }
          await finishEnrollment(verifyResult.data.enrollment);
        } catch (error) {
          setPayBusy(false, `Pay ${window.GradflowEnrollment.formatPrice(course.price)} and enroll`);
          showToast('Payment not verified.', error.message);
        }
      },
      modal: {
        ondismiss: () => {
          setPayBusy(false, `Pay ${window.GradflowEnrollment.formatPrice(course.price)} and enroll`);
          showToast('Checkout closed.', 'No enrollment was saved because payment was not completed.');
        },
      },
    });
    checkout.open();
  } catch (error) {
    setPayBusy(false, `Pay ${window.GradflowEnrollment.formatPrice(course.price)} and enroll`);
    showToast('Payment could not start.', error.message);
  }
});

document.getElementById('startContent')?.addEventListener('click', () => {
  document.getElementById('currentLesson').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

boot();
