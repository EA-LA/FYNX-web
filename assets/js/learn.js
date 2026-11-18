/**
 * FYNX LEARNING PLATFORM
 * Main JavaScript file for lessons, quizzes, and glossary
 */

// =====================================================
// STATE MANAGEMENT
// =====================================================

const FYNXLearn = {
  currentTopic: '',
  lessons: [],
  quizzes: [],
  glossary: [],
  progress: {},
  quizResults: {},
  
  init(topic) {
    this.currentTopic = topic;
    this.loadProgress();
    this.loadQuizResults();
  },
  
  loadProgress() {
    const saved = localStorage.getItem(`fynx_progress_${this.currentTopic}`);
    this.progress = saved ? JSON.parse(saved) : {};
  },
  
  saveProgress() {
    localStorage.setItem(`fynx_progress_${this.currentTopic}`, JSON.stringify(this.progress));
  },
  
  markLessonComplete(lessonId) {
    this.progress[lessonId] = { completed: true, date: new Date().toISOString() };
    this.saveProgress();
    this.updateProgressBar();
  },
  
  loadQuizResults() {
    const saved = localStorage.getItem(`fynx_quiz_${this.currentTopic}`);
    this.quizResults = saved ? JSON.parse(saved) : { total: 0, correct: 0, byLevel: {} };
  },
  
  saveQuizResults() {
    localStorage.setItem(`fynx_quiz_${this.currentTopic}`, JSON.stringify(this.quizResults));
  },
  
  updateProgressBar() {
    const totalLessons = this.lessons.length;
    const completedLessons = Object.keys(this.progress).length;
    const percentage = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;
    
    const progressFill = document.querySelector('.progress-fill');
    const progressStats = document.querySelector('.progress-stats');
    
    if (progressFill) {
      progressFill.style.width = `${percentage}%`;
    }
    
    if (progressStats) {
      progressStats.textContent = `${completedLessons} of ${totalLessons} lessons completed`;
    }
  }
};

// =====================================================
// LESSONS PAGE
// =====================================================

async function loadLessons(topic) {
  try {
    const response = await fetch(`/assets/data/${topic}_lessons.json`);
    FYNXLearn.lessons = await response.json();
    renderLessons();
    FYNXLearn.updateProgressBar();
    addGlossaryTooltips();
  } catch (error) {
    console.error('Error loading lessons:', error);
  }
}

function renderLessons() {
  const container = document.getElementById('lessons-container');
  if (!container) return;
  
  let currentModule = '';
  let html = '';
  
  FYNXLearn.lessons.forEach((lesson, index) => {
    if (lesson.module !== currentModule) {
      if (currentModule !== '') html += '</div>';
      currentModule = lesson.module;
      html += `
        <div class="lesson-module">
          <div class="module-header">
            <div class="module-number">${lesson.moduleNumber}</div>
            <h2 class="module-title">${lesson.module}</h2>
          </div>
          <div class="lessons-grid">
      `;
    }
    
    const isCompleted = FYNXLearn.progress[lesson.id];
    const completedClass = isCompleted ? 'completed' : '';
    
    html += `
      <div class="lesson-card ${completedClass}" data-lesson-id="${lesson.id}">
        <div class="lesson-header">
          <div class="lesson-info">
            <h3 class="lesson-title">
              ${lesson.title}
              ${isCompleted ? '<span style="color: var(--success);">✓</span>' : ''}
            </h3>
            <div class="lesson-meta">
              <span>📖 ${lesson.duration}</span>
              <span>📊 ${lesson.level}</span>
            </div>
          </div>
          <div class="lesson-status">
            ${isCompleted ? 
              '<span class="status-badge completed">Completed</span>' : 
              '<span class="status-badge">Not started</span>'
            }
          </div>
        </div>
        
        <div class="lesson-content">
          <div class="lesson-objective">
            <div class="objective-label">Learning Objective</div>
            <div>${lesson.objective}</div>
          </div>
          
          <div class="lesson-body">
            ${lesson.content}
          </div>
          
          ${lesson.example ? `
            <div class="lesson-example">
              <div class="example-label">
                💡 Example
              </div>
              <div class="example-content">${lesson.example}</div>
            </div>
          ` : ''}
          
          ${lesson.mistakes ? `
            <div class="lesson-mistakes">
              <div class="mistakes-label">
                ⚠️ Common Mistakes
              </div>
              <ul class="mistakes-list">
                ${lesson.mistakes.map(m => `<li>${m}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          
          ${lesson.checklist ? `
            <div class="lesson-checklist">
              <div class="checklist-label">
                ✅ Checklist
              </div>
              <ul class="checklist-items">
                ${lesson.checklist.map(c => `<li>${c}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          
          <div class="lesson-actions">
            <button class="btn btn-primary" onclick="markComplete('${lesson.id}')">
              ${isCompleted ? 'Completed ✓' : 'Mark as Complete'}
            </button>
          </div>
        </div>
      </div>
    `;
  });
  
  if (currentModule !== '') html += '</div></div>';
  container.innerHTML = html;
  
  // Add click handlers
  document.querySelectorAll('.lesson-card').forEach(card => {
    card.addEventListener('click', function(e) {
      if (e.target.tagName !== 'BUTTON') {
        this.classList.toggle('expanded');
      }
    });
  });
}

function markComplete(lessonId) {
  FYNXLearn.markLessonComplete(lessonId);
  renderLessons();
}

// =====================================================
// QUIZ PAGE
// =====================================================

let currentQuizFilter = 'all';
let currentQuestionIndex = 0;
let quizQuestions = [];

async function loadQuizzes(topic) {
  try {
    const response = await fetch(`/assets/data/${topic}_quizzes.json`);
    FYNXLearn.quizzes = await response.json();
    filterQuizzes(currentQuizFilter);
    updateQuizStats();
  } catch (error) {
    console.error('Error loading quizzes:', error);
  }
}

function filterQuizzes(level) {
  currentQuizFilter = level;
  
  // Update filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.level === level) {
      btn.classList.add('active');
    }
  });
  
  // Filter questions
  if (level === 'all') {
    quizQuestions = [...FYNXLearn.quizzes];
  } else {
    quizQuestions = FYNXLearn.quizzes.filter(q => q.level === level);
  }
  
  currentQuestionIndex = 0;
  renderQuizQuestions();
}

function renderQuizQuestions() {
  const container = document.getElementById('quiz-container');
  if (!container) return;
  
  let html = '';
  
  quizQuestions.forEach((question, index) => {
    html += `
      <div class="quiz-question" data-question-id="${question.id}">
        <div class="question-header">
          <span class="question-number">Question ${index + 1} of ${quizQuestions.length}</span>
          <span class="question-difficulty ${question.level}">${question.level}</span>
        </div>
        
        <div class="question-text">${question.question}</div>
        
        <div class="question-options">
          ${question.options.map((option, optIndex) => `
            <div class="option" data-option="${optIndex}" onclick="selectAnswer(${index}, ${optIndex})">
              <div class="option-letter">${String.fromCharCode(65 + optIndex)}</div>
              <div class="option-text">${option}</div>
            </div>
          `).join('')}
        </div>
        
        <div class="question-explanation" id="explanation-${index}">
          <div class="explanation-label">
            💡 Explanation
          </div>
          <div class="explanation-text">${question.explanation}</div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function selectAnswer(questionIndex, optionIndex) {
  const question = quizQuestions[questionIndex];
  const questionEl = document.querySelectorAll('.quiz-question')[questionIndex];
  const options = questionEl.querySelectorAll('.option');
  const explanation = questionEl.querySelector('.question-explanation');
  
  // Remove previous selections
  options.forEach(opt => {
    opt.classList.remove('selected', 'correct', 'incorrect');
  });
  
  // Mark selected
  const selectedOption = options[optionIndex];
  selectedOption.classList.add('selected');
  
  // Check if correct
  const isCorrect = optionIndex === question.correct;
  
  if (isCorrect) {
    selectedOption.classList.add('correct');
    FYNXLearn.quizResults.correct = (FYNXLearn.quizResults.correct || 0) + 1;
  } else {
    selectedOption.classList.add('incorrect');
    options[question.correct].classList.add('correct');
  }
  
  // Update stats
  FYNXLearn.quizResults.total = (FYNXLearn.quizResults.total || 0) + 1;
  
  if (!FYNXLearn.quizResults.byLevel) FYNXLearn.quizResults.byLevel = {};
  if (!FYNXLearn.quizResults.byLevel[question.level]) {
    FYNXLearn.quizResults.byLevel[question.level] = { total: 0, correct: 0 };
  }
  FYNXLearn.quizResults.byLevel[question.level].total++;
  if (isCorrect) FYNXLearn.quizResults.byLevel[question.level].correct++;
  
  FYNXLearn.saveQuizResults();
  updateQuizStats();
  
  // Show explanation
  explanation.classList.add('show');
  
  // Disable further clicks
  options.forEach(opt => opt.style.pointerEvents = 'none');
}

function updateQuizStats() {
  const totalEl = document.getElementById('total-answered');
  const accuracyEl = document.getElementById('accuracy');
  const streakEl = document.getElementById('streak');
  
  if (totalEl) totalEl.textContent = FYNXLearn.quizResults.total || 0;
  
  if (accuracyEl) {
    const accuracy = FYNXLearn.quizResults.total > 0 
      ? Math.round((FYNXLearn.quizResults.correct / FYNXLearn.quizResults.total) * 100)
      : 0;
    accuracyEl.textContent = `${accuracy}%`;
  }
  
  if (streakEl) {
    // Simple streak calculation - can be enhanced
    streakEl.textContent = FYNXLearn.quizResults.correct || 0;
  }
}

function resetQuizProgress() {
  if (confirm('Are you sure you want to reset all quiz progress?')) {
    FYNXLearn.quizResults = { total: 0, correct: 0, byLevel: {} };
    FYNXLearn.saveQuizResults();
    location.reload();
  }
}

// =====================================================
// GLOSSARY PAGE
// =====================================================

let allGlossaryTerms = [];

async function loadGlossary(topic) {
  try {
    const response = await fetch(`/assets/data/${topic}_glossary.json`);
    FYNXLearn.glossary = await response.json();
    allGlossaryTerms = [...FYNXLearn.glossary];
    renderGlossary(allGlossaryTerms);
    setupAlphabetFilter();
  } catch (error) {
    console.error('Error loading glossary:', error);
  }
}

function renderGlossary(terms) {
  const container = document.getElementById('glossary-container');
  if (!container) return;
  
  if (terms.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 3rem;">No terms found</p>';
    return;
  }
  
  let html = '';
  terms.forEach(term => {
    html += `
      <div class="term-card">
        <div class="term-header">
          <h3 class="term-word">${term.term}</h3>
          <div class="term-letter">${term.term[0].toUpperCase()}</div>
        </div>
        <p class="term-definition">${term.definition}</p>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function setupAlphabetFilter() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const existingLetters = new Set(allGlossaryTerms.map(t => t.term[0].toUpperCase()));
  
  const filterContainer = document.querySelector('.alphabet-filter');
  if (!filterContainer) return;
  
  filterContainer.innerHTML = alphabet.map(letter => `
    <button class="letter-btn" 
            data-letter="${letter}" 
            onclick="filterByLetter('${letter}')"
            ${!existingLetters.has(letter) ? 'disabled' : ''}>
      ${letter}
    </button>
  `).join('') + `
    <button class="letter-btn active" onclick="filterByLetter('all')">All</button>
  `;
}

function filterByLetter(letter) {
  document.querySelectorAll('.letter-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  
  if (letter === 'all') {
    renderGlossary(allGlossaryTerms);
  } else {
    const filtered = allGlossaryTerms.filter(t => t.term[0].toUpperCase() === letter);
    renderGlossary(filtered);
  }
  
  // Reset search
  const searchInput = document.getElementById('glossary-search');
  if (searchInput) searchInput.value = '';
}

function searchGlossary() {
  const query = document.getElementById('glossary-search').value.toLowerCase();
  const filtered = allGlossaryTerms.filter(term => 
    term.term.toLowerCase().includes(query) || 
    term.definition.toLowerCase().includes(query)
  );
  renderGlossary(filtered);
  
  // Reset letter filter
  document.querySelectorAll('.letter-btn').forEach(btn => btn.classList.remove('active'));
}

// =====================================================
// GLOSSARY TOOLTIPS (for lesson pages)
// =====================================================

async function addGlossaryTooltips() {
  if (FYNXLearn.glossary.length === 0) {
    try {
      const response = await fetch(`/assets/data/${FYNXLearn.currentTopic}_glossary.json`);
      FYNXLearn.glossary = await response.json();
    } catch (error) {
      return; // Silently fail if glossary not available
    }
  }
  
  const lessonBodies = document.querySelectorAll('.lesson-body, .example-content');
  
  lessonBodies.forEach(body => {
    let html = body.innerHTML;
    
    FYNXLearn.glossary.forEach(term => {
      const regex = new RegExp(`\\b${term.term}\\b`, 'gi');
      html = html.replace(regex, match => {
        return `<span class="glossary-term">${match}<span class="glossary-tooltip"><strong>${term.term}</strong>${term.definition}</span></span>`;
      });
    });
    
    body.innerHTML = html;
  });
}

// =====================================================
// STUDY MODE
// =====================================================

function toggleStudyMode() {
  const toggle = document.querySelector('.toggle-switch');
  const body = document.body;
  
  toggle.classList.toggle('active');
  body.classList.toggle('study-mode-active');
  
  const isActive = toggle.classList.contains('active');
  localStorage.setItem('fynx_study_mode', isActive);
}

// Load study mode preference
window.addEventListener('DOMContentLoaded', () => {
  const studyMode = localStorage.getItem('fynx_study_mode') === 'true';
  if (studyMode) {
    document.querySelector('.toggle-switch')?.classList.add('active');
    document.body.classList.add('study-mode-active');
  }
});

// =====================================================
// PRINT / DOWNLOAD
// =====================================================

function printCheatSheet() {
  window.print();
}

// =====================================================
// NAVIGATION HIGHLIGHTING
// =====================================================

function highlightCurrentNav() {
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav-links a, .sub-nav-link').forEach(link => {
    if (link.getAttribute('href') === currentPath || 
        currentPath.includes(link.getAttribute('href'))) {
      link.classList.add('active');
    }
  });
}

window.addEventListener('DOMContentLoaded', highlightCurrentNav);

// =====================================================
// EXPORT FUNCTIONS
// =====================================================

window.FYNXLearn = FYNXLearn;
window.loadLessons = loadLessons;
window.loadQuizzes = loadQuizzes;
window.loadGlossary = loadGlossary;
window.markComplete = markComplete;
window.filterQuizzes = filterQuizzes;
window.selectAnswer = selectAnswer;
window.resetQuizProgress = resetQuizProgress;
window.searchGlossary = searchGlossary;
window.filterByLetter = filterByLetter;
window.toggleStudyMode = toggleStudyMode;
window.printCheatSheet = printCheatSheet;
