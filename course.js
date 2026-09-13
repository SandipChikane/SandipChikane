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
  fillMedia('lessonMedia', lesson.videoUrl, lesson.imageUrl);
  renderLessonResource(lesson);
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
  if (email) {
    document.getElementById('enrollEmail').value = email;
    const signInEmail = document.getElementById('signInEmail');
    if (signInEmail) signInEmail.value = email;
  }
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
  await hydrateCourse();
  renderUnlocked();
  showToast('Payment verified.', `${course.name} is unlocked. TPOs never see this payment.`);
  unlockedState.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function protectMedia(element) {
  if (!element) return element;
  element.controlsList = 'nodownload noremoteplayback';
  element.disablePictureInPicture = true;
  element.setAttribute('controlsList', 'nodownload noremoteplayback');
  element.setAttribute('disablePictureInPicture', '');
  element.setAttribute('controlslist', 'nodownload noremoteplayback');
  element.draggable = false;
  element.addEventListener('contextmenu', (event) => event.preventDefault());
  element.addEventListener('dragstart', (event) => event.preventDefault());
  return element;
}

function renderLessonResource(lesson = {}) {
  const resource = document.getElementById('lessonResource');
  if (!resource) return;
  resource.replaceChildren();
  if (lesson.resourceUrl) {
    const card = document.createElement('div');
    card.className = 'resource-card';
    const button = document.createElement('button');
    button.className = 'arrow-link';
    button.type = 'button';
    button.textContent = `${lesson.resourceLabel || 'Open resource'} →`;
    const frame = document.createElement('div');
    frame.className = 'resource-frame';
    frame.hidden = true;
    button.addEventListener('click', () => openProtectedResource(frame, lesson.resourceUrl));
    const note = document.createElement('p');
    note.className = 'resource-note';
    note.textContent = 'View in the browser. Downloads are turned off.';
    card.append(button, frame, note);
    resource.appendChild(card);
    resource.hidden = false;
    return;
  }
  if (lesson.resourceBlocked) {
    const note = document.createElement('p');
    note.className = 'resource-note';
    note.textContent = 'This file stays in the lesson player and cannot be downloaded.';
    resource.appendChild(note);
    resource.hidden = false;
    return;
  }
  resource.hidden = true;
}

function openProtectedResource(frame, url) {
  frame.hidden = false;
  frame.replaceChildren();
  const kind = new URL(url, window.location.origin).searchParams.get('kind');
  if (kind === 'image' || /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url)) {
    const image = protectMedia(document.createElement('img'));
    image.src = url;
    image.alt = 'Lesson resource';
    frame.appendChild(image);
    return;
  }
  if (kind === 'video' || /\.(mp4|webm|m4v|mov)(\?|$)/i.test(url)) {
    const video = protectMedia(document.createElement('video'));
    video.src = url;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    frame.appendChild(video);
    return;
  }
  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.title = 'Lesson resource';
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.addEventListener('contextmenu', (event) => event.preventDefault());
  frame.appendChild(iframe);
}

function fillMedia(id, videoUrl, imageUrl) {
  const node = document.getElementById(id);
  if (!node) return;
  node.replaceChildren();
  if (videoUrl) {
    const video = protectMedia(document.createElement('video'));
    video.src = videoUrl;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    node.appendChild(video);
    node.hidden = false;
    return;
  }
  if (imageUrl) {
    const image = protectMedia(document.createElement('img'));
    image.src = imageUrl;
    image.alt = '';
    node.appendChild(image);
    node.hidden = false;
    return;
  }
  node.hidden = true;
}

async function hydrateCourse() {
  const id = params.get('course') || course?.id;
  if (!id) return;
  const detail = await window.GradflowEnrollment.loadStudentCourse(id, {
    preview: params.get('preview') === '1',
  });
  if (detail) course = detail;
}

async function boot() {
  await window.GradflowEnrollment.loadPublishedCatalog();
  course = window.GradflowEnrollment.courseById(params.get('course'))
    || window.GradflowEnrollment.courseByName(params.get('course'));
  if (params.get('preview') === '1' && params.get('course')) {
    await hydrateCourse();
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
    await hydrateCourse();
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
  const password = document.getElementById('enrollPassword').value;
  const passwordConfirm = document.getElementById('enrollPasswordConfirm').value;
  if (!email || !college) return;
  if (password !== passwordConfirm) {
    showToast('Passwords do not match.', 'Use the same password in both fields so you can sign in later.');
    return;
  }

  window.GradflowEnrollment.setStudentEmail(email);
  window.GradflowEnrollment.setStudentCollege(college);
  setPayBusy(true, 'Creating Razorpay order…');

  try {
    const orderResult = await window.GradflowEnrollment.createOrder({
      courseId: course.id,
      email,
      college,
      password,
    });

    if (orderResult.data.alreadyEnrolled && orderResult.data.enrollment?.paid) {
      await finishEnrollment(orderResult.data.enrollment);
      return;
    }
    if (orderResult.status === 409) {
      throw new Error(orderResult.data.error || 'You already bought this course. Sign in below.');
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
            password,
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

document.getElementById('signInForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.getElementById('signInEmail').value.trim();
  const password = document.getElementById('signInPassword').value;
  const button = document.getElementById('signInButton');
  if (button) button.disabled = true;
  try {
    const result = await window.GradflowEnrollment.studentLogin({ email, password });
    if (!result.ok) {
      throw new Error(result.data.error || 'Could not sign in.');
    }
    if (window.GradflowEnrollment.isEnrolled(course.id)) {
      await hydrateCourse();
      renderUnlocked();
      showToast('Signed in.', `${course.name} is unlocked on this device.`);
      document.getElementById('unlockedState').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    showToast('Signed in.', 'This email does not have this course yet. Pay below to enroll.');
  } catch (error) {
    showToast('Could not sign in.', error.message);
  } finally {
    if (button) button.disabled = false;
  }
});

document.getElementById('startContent')?.addEventListener('click', () => {
  document.getElementById('currentLesson').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

document.addEventListener('contextmenu', (event) => {
  if (event.target.closest('.course-media, .resource-frame, .current-lesson video, .current-lesson img')) {
    event.preventDefault();
  }
});

boot();
