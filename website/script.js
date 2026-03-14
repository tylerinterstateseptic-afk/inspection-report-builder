// ===== Mobile Nav Toggle =====
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});

// Close mobile nav when a link is clicked
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
  });
});

// ===== Accordion Toggle =====
document.querySelectorAll('.accordion-header').forEach(header => {
  header.addEventListener('click', () => {
    const accordion = header.parentElement;
    const isOpen = accordion.classList.contains('open');

    // Close all accordions
    document.querySelectorAll('.accordion').forEach(a => a.classList.remove('open'));

    // Toggle the clicked one
    if (!isOpen) {
      accordion.classList.add('open');
    }

    // Update aria
    header.setAttribute('aria-expanded', !isOpen);
  });
});

// ===== Navbar background on scroll =====
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 50) {
    navbar.style.background = 'rgba(13, 17, 23, 0.97)';
  } else {
    navbar.style.background = 'rgba(13, 17, 23, 0.9)';
  }
});

// ===== Smooth scroll for anchor links =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// ===== Screenshot Carousel =====
const slides = document.querySelectorAll('.carousel-slide');
const dots = document.querySelectorAll('.carousel-dot');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const captionEl = document.getElementById('carouselCaption');

const captions = [
  'Header Info — Customer & Job Details',
  'Septic Tank — Comprehensive Field Dropdowns',
  'Leachfield & Septic Design — AI Improve',
  'Inspection Photos & Recommendations',
  'Email Reports — Auto-Attached PDF Delivery'
];

let currentSlide = 0;
let autoplayTimer = null;

function showSlide(index) {
  slides.forEach(s => s.classList.remove('active'));
  dots.forEach(d => d.classList.remove('active'));
  currentSlide = (index + slides.length) % slides.length;
  slides[currentSlide].classList.add('active');
  dots[currentSlide].classList.add('active');
  if (captionEl) captionEl.textContent = captions[currentSlide] || '';
}

function nextSlide() { showSlide(currentSlide + 1); }
function prevSlide() { showSlide(currentSlide - 1); }

function startAutoplay() {
  stopAutoplay();
  autoplayTimer = setInterval(nextSlide, 4000);
}

function stopAutoplay() {
  if (autoplayTimer) clearInterval(autoplayTimer);
}

if (prevBtn && nextBtn) {
  prevBtn.addEventListener('click', () => { prevSlide(); startAutoplay(); });
  nextBtn.addEventListener('click', () => { nextSlide(); startAutoplay(); });
}

dots.forEach(dot => {
  dot.addEventListener('click', () => {
    showSlide(parseInt(dot.dataset.index));
    startAutoplay();
  });
});

// Start autoplay
if (slides.length > 0) startAutoplay();

// ===== Install Help Tabs (Windows / Mac) =====
document.querySelectorAll('.install-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    // Toggle buttons
    document.querySelectorAll('.install-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Toggle content
    document.querySelectorAll('.install-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('install-tab-' + tab).classList.add('active');
  });
});
