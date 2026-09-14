const TITLE_MAX = 180;
const LINE_MAX = 240;
const TEXT_MAX = 2400;
const SHORT_MAX = 80;

export function defaultLanding() {
  return {
    pageTitle: 'Gradflow — From campus to career',
    announcement: 'New learning paths appear here when you publish them',
    heroEyebrow: 'Career school for the real world',
    heroTitleBefore: 'Graduate with',
    heroTitleEm: 'proof',
    heroTitleAfter: ', not just\na degree.',
    heroLede: 'Tool-first programs, guided portfolio projects and a clear path from final semester to your first great role.',
    heroCta: 'Find your course',
    heroVideoCta: 'See how Gradflow works',
    heroProofStat: '4,200+ final-year students',
    heroProofSub: 'are building their next move',
    marqueeLabel: 'Built for students from campuses across India',
    marqueeItems: ['VIT', 'MIT', 'SRM', 'Manipal', 'Amity', 'Christ'],
    introLabel: 'THE GRADFLOW WAY',
    introTitleBefore: 'Less watching.\nMore ',
    introTitleEm: 'doing.',
    introTitleAfter: '',
    introCopy: 'The gap between college and a role is rarely talent. It’s knowing which tools matter, getting feedback while you build, and having work you can confidently show.',
    introLink: 'Explore the learning experience',
    principle1Title: 'Tools that teams use',
    principle1Copy: 'Learn current, practical workflows—not outdated theory.',
    principle2Title: 'Projects with a purpose',
    principle2Copy: 'Every project becomes a strong, explainable portfolio piece.',
    principle3Title: 'Career momentum',
    principle3Copy: 'Get structured support from first lesson to first interview.',
    coursesLabel: 'PICK YOUR PATH',
    coursesTitleBefore: 'Build for the role\nyou ',
    coursesTitleEm: 'want.',
    coursesTitleAfter: '',
    coursesIntro: 'Focused learning paths shaped around the work companies are hiring for right now.',
    showcaseLabel: 'NOT ANOTHER CERTIFICATE',
    showcaseTitleBefore: 'Make work\nworth ',
    showcaseTitleEm: 'showing.',
    showcaseTitleAfter: '',
    showcaseIntro: 'You’ll finish with a portfolio that gives recruiters a reason to pause—and a story you’re proud to tell.',
    showcaseNote: 'A living portfolio, created one project at a time.',
    showcaseStat1Value: '06',
    showcaseStat1Label: 'portfolio projects',
    showcaseStat2Value: '4.8/5',
    showcaseStat2Label: 'average mentor feedback',
    showcaseCta: 'Preview a student portfolio',
    outcomesLabel: 'OUTCOMES THAT COUNT',
    outcomesTitleBefore: 'Ready when\nopportunity\n',
    outcomesTitleEm: 'knocks.',
    outcomesTitleAfter: '',
    outcomesCopy: 'Gradflow students leave with practical confidence: real work, a clearer career direction, and stories that make an interview feel less scary.',
    outcome1Value: '86%',
    outcome1Label: 'say they feel career-ready after their pathway',
    outcome2Value: '4.8/5',
    outcome2Label: 'average project review from industry mentors',
    outcome3Value: '3×',
    outcome3Label: 'more likely to finish a portfolio project',
    outcomesLink: 'Meet the graduates',
    storiesLabel: 'THEIR NEXT CHAPTER',
    storiesTitleBefore: 'They built the\n',
    storiesTitleEm: 'bridge.',
    storiesTitleAfter: '',
    story1Quote: 'Gradflow made me stop saying ‘I only know the basics.’ I had actual work to talk about in every interview.',
    story1Name: 'Rhea Gupta',
    story1Role: 'Junior Data Analyst, InMobi',
    story1Course: 'DATA ANALYTICS',
    story2Quote: 'My portfolio became the thing that got me replies. I had something specific to show, not just a list of skills.',
    story2Name: 'Karthik Rao',
    story2Role: 'Frontend Developer, Mintlify',
    story3Quote: 'I learned how to explain the ‘why’ behind my designs. That changed every conversation I had with recruiters.',
    story3Name: 'Ananya Nair',
    story3Role: 'UX Associate, Jio',
    tpoEyebrow: 'Built alongside your placement cell',
    tpoTitleBefore: 'See your cohort\nmove ',
    tpoTitleEm: 'forward.',
    tpoTitleAfter: '',
    tpoCopy: 'Give students a practical edge, while your TPO team gets a clear, privacy-first view of engagement, project progress and career readiness.',
    tpoItem1: 'Free TPO workspace, always',
    tpoItem2: 'No student payment data, ever',
    tpoItem3: 'Monthly progress summaries',
    tpoCta: 'Get your TPO workspace',
    faqLabel: 'GOOD QUESTIONS',
    faqTitleBefore: 'A little more\n',
    faqTitleEm: 'clarity.',
    faqTitleAfter: '',
    faq1Question: 'Who are Gradflow courses for?',
    faq1Answer: 'Gradflow is designed for final-year students and recent graduates who want to move from learning to doing. You don’t need prior experience—just curiosity and the commitment to build.',
    faq2Question: 'How are the courses taught?',
    faq2Answer: 'Each pathway combines short tool lessons, guided project sprints, feedback from practitioners and career-ready templates you can keep using.',
    faq3Question: 'Will I get a certificate?',
    faq3Answer: 'Yes. More importantly, you’ll have a verified project portfolio and completion record that shows what you learned and built.',
    faq4Question: 'What does the TPO workspace include?',
    faq4Answer: 'TPOs get a free cohort view of enrollment, active learning, project submissions and career-readiness trends. Student payment details are never visible.',
    ctaEyebrow: 'YOUR CAREER, IN MOTION',
    ctaTitleBefore: 'You’re closer than\nyou ',
    ctaTitleEm: 'think.',
    ctaTitleAfter: '',
    ctaButton: 'Start building today',
    footerTagline: 'From campus to career,\nwith proof.',
    footerNote: 'Made for the next move',
  };
}

const STRING_FIELDS = Object.keys(defaultLanding()).filter((key) => key !== 'marqueeItems');

export function coerceLandingSource(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
  }
  return {};
}

export function parseLanding(raw) {
  const defaults = defaultLanding();
  const source = coerceLandingSource(raw);
  const next = { ...defaults };
  for (const key of STRING_FIELDS) {
    if (source[key] == null || source[key] === '') continue;
    const max = key.endsWith('Copy') || key.endsWith('Answer') || key.endsWith('Quote') || key.endsWith('Lede') || key.endsWith('Intro') || key === 'footerTagline'
      ? TEXT_MAX
      : key.endsWith('Label') || key.endsWith('Value') || key.endsWith('Em')
        ? SHORT_MAX
        : key.endsWith('After') || key.endsWith('Before') || key.includes('Title')
          ? TITLE_MAX
          : LINE_MAX;
    next[key] = cleanText(source[key], defaults[key], max);
  }
  next.marqueeItems = parseMarqueeItems(source.marqueeItems, defaults.marqueeItems);
  return next;
}

export function parseMarqueeItems(value, fallback = []) {
  const list = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')
      .map((item) => item.trim());
  const cleaned = list.map((item) => cleanText(item, '', SHORT_MAX)).filter(Boolean).slice(0, 16);
  return cleaned.length ? cleaned : fallback;
}

function cleanText(value, fallback = '', max = LINE_MAX) {
  const text = String(value ?? '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\0/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!text) return fallback;
  return text.slice(0, max);
}
