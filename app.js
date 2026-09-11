const navToggle = document.querySelector(".nav-toggle");
const navMenu = document.querySelector(".nav-menu");
const navLinks = document.querySelectorAll(".nav-menu a");

function closeMenu() {
  navToggle?.setAttribute("aria-expanded", "false");
  navToggle?.setAttribute("aria-label", "Open navigation menu");
  navMenu?.classList.remove("open");
  document.body.classList.remove("menu-open");
}

navToggle?.addEventListener("click", () => {
  const isOpen = navToggle.getAttribute("aria-expanded") === "true";
  navToggle.setAttribute("aria-expanded", String(!isOpen));
  navToggle.setAttribute("aria-label", isOpen ? "Open navigation menu" : "Close navigation menu");
  navMenu?.classList.toggle("open", !isOpen);
  document.body.classList.toggle("menu-open", !isOpen);
});

navLinks.forEach((link) => link.addEventListener("click", closeMenu));

window.addEventListener("resize", () => {
  if (window.innerWidth > 980) closeMenu();
});

const revealItems = document.querySelectorAll(".reveal");
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 },
);

revealItems.forEach((item) => revealObserver.observe(item));

const filters = document.querySelectorAll(".filter");
const jobCards = document.querySelectorAll(".job-card");

filters.forEach((filter) => {
  filter.addEventListener("click", () => {
    const category = filter.dataset.filter;

    filters.forEach((button) => {
      const isActive = button === filter;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    jobCards.forEach((card) => {
      const matches = category === "all" || card.dataset.category === category;
      card.classList.toggle("hidden", !matches);
    });
  });
});

const modal = document.querySelector("#role-modal");
const modalTitle = document.querySelector("#modal-title");
const modalCompany = document.querySelector("#modal-company");
let lastFocusedElement = null;

function closeModal() {
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  lastFocusedElement?.focus();
}

document.querySelectorAll(".job-action").forEach((button) => {
  button.addEventListener("click", () => {
    const card = button.closest(".job-card");
    if (!card || !modal || !modalTitle || !modalCompany) return;

    lastFocusedElement = button;
    modalTitle.textContent = card.querySelector("h3")?.textContent ?? "Opportunity";
    modalCompany.textContent = card.querySelector(".company")?.textContent ?? "";
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    modal.querySelector(".modal-close")?.focus();
  });
});

document.querySelectorAll("[data-close-modal]").forEach((element) => {
  element.addEventListener("click", closeModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (modal?.classList.contains("open")) closeModal();
    else closeMenu();
  }
});

const recruiterForm = document.querySelector("#recruiter-form");
const formMessage = recruiterForm?.querySelector(".form-message");

recruiterForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const requiredFields = recruiterForm.querySelectorAll("[required]");
  let firstInvalidField = null;

  requiredFields.forEach((field) => {
    const isValid = field.checkValidity();
    field.setAttribute("aria-invalid", String(!isValid));
    if (!isValid && !firstInvalidField) firstInvalidField = field;
  });

  if (firstInvalidField) {
    if (formMessage) {
      formMessage.textContent = "Please complete all fields with valid information.";
      formMessage.classList.remove("success");
    }
    firstInvalidField.focus();
    return;
  }

  if (formMessage) {
    formMessage.textContent = "Thanks! Your enquiry is ready for the placement team.";
    formMessage.classList.add("success");
  }
  recruiterForm.reset();
  recruiterForm.querySelectorAll("[aria-invalid]").forEach((field) => {
    field.removeAttribute("aria-invalid");
  });
});

recruiterForm?.querySelectorAll("input, select").forEach((field) => {
  field.addEventListener("input", () => {
    if (field.checkValidity()) field.removeAttribute("aria-invalid");
  });
});

const sections = document.querySelectorAll("main section[id]");
const sectionLinks = document.querySelectorAll('.nav-menu a[href^="#"]');
const activeSectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      sectionLinks.forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`);
      });
    });
  },
  { rootMargin: "-25% 0px -65% 0px" },
);

sections.forEach((section) => activeSectionObserver.observe(section));

const year = document.querySelector("#year");
if (year) year.textContent = String(new Date().getFullYear());
