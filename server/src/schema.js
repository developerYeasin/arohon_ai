// Database schema. Every statement is idempotent so `npm run migrate` can be re-run safely.
export const schema = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NULL UNIQUE,
    phone VARCHAR(20) NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    role ENUM('student','teacher','admin') NOT NULL DEFAULT 'student',
    track ENUM('academic','admission','job') NOT NULL DEFAULT 'job',
    target_exam_id INT NULL,
    district VARCHAR(60) NULL,
    institution VARCHAR(160) NULL,
    exam_date DATE NULL,
    daily_minutes INT NOT NULL DEFAULT 60,
    xp INT NOT NULL DEFAULT 0,
    streak INT NOT NULL DEFAULT 0,
    best_streak INT NOT NULL DEFAULT 0,
    last_active_date DATE NULL,
    show_on_leaderboard TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Target exams: SSC, HSC, DU-Ka, Medical, BCS Preli, Bank, Primary, NTRCA ...
  `CREATE TABLE IF NOT EXISTS exams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    track ENUM('academic','admission','job') NOT NULL,
    code VARCHAR(40) NOT NULL UNIQUE,
    name_bn VARCHAR(160) NOT NULL,
    name_en VARCHAR(160) NOT NULL,
    description TEXT NULL,
    total_questions INT NOT NULL DEFAULT 100,
    duration_min INT NOT NULL DEFAULT 60,
    negative_mark DECIMAL(4,2) NOT NULL DEFAULT 0.25,
    sec_per_question INT NOT NULL DEFAULT 36,
    next_exam_date DATE NULL,
    color VARCHAR(20) NULL,
    sort_order INT NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS subjects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    track ENUM('academic','admission','job') NOT NULL,
    slug VARCHAR(60) NOT NULL UNIQUE,
    name_bn VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // How many questions each subject carries in a target exam (syllabus weight).
  `CREATE TABLE IF NOT EXISTS exam_subjects (
    exam_id INT NOT NULL,
    subject_id INT NOT NULL,
    question_count INT NOT NULL,
    PRIMARY KEY (exam_id, subject_id),
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS topics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject_id INT NOT NULL,
    name_bn VARCHAR(160) NOT NULL,
    name_en VARCHAR(160) NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS current_affairs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(40) NOT NULL,
    summary TEXT NOT NULL,
    key_facts JSON NULL,
    published_on DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Every question carries its provenance, relevance and live quality stats.
  `CREATE TABLE IF NOT EXISTS questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject_id INT NOT NULL,
    topic_id INT NOT NULL,
    body TEXT NOT NULL,
    option_a VARCHAR(500) NOT NULL,
    option_b VARCHAR(500) NOT NULL,
    option_c VARCHAR(500) NOT NULL,
    option_d VARCHAR(500) NOT NULL,
    correct_option CHAR(1) NOT NULL,
    explanation TEXT NULL,
    difficulty TINYINT NOT NULL DEFAULT 3,
    source VARCHAR(160) NULL,
    exam_ref VARCHAR(120) NULL,
    year SMALLINT NULL,
    current_affair_id INT NULL,
    status ENUM('active','needs_review','retired') NOT NULL DEFAULT 'active',
    version INT NOT NULL DEFAULT 1,
    last_verified_at DATE NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    correct_count INT NOT NULL DEFAULT 0,
    skip_count INT NOT NULL DEFAULT 0,
    total_time_ms BIGINT NOT NULL DEFAULT 0,
    wrong_a INT NOT NULL DEFAULT 0, wrong_b INT NOT NULL DEFAULT 0,
    wrong_c INT NOT NULL DEFAULT 0, wrong_d INT NOT NULL DEFAULT 0,
    report_count INT NOT NULL DEFAULT 0,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_q_topic (topic_id), INDEX idx_q_subject (subject_id), INDEX idx_q_status (status),
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    FOREIGN KEY (topic_id) REFERENCES topics(id),
    FOREIGN KEY (current_affair_id) REFERENCES current_affairs(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS question_versions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question_id INT NOT NULL,
    version INT NOT NULL,
    snapshot JSON NOT NULL,
    change_note VARCHAR(255) NULL,
    changed_by INT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // A test is any question set: practice, adaptive, mock, live, mission, revision, challenge.
  `CREATE TABLE IF NOT EXISTS tests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    kind ENUM('practice','adaptive','mock','live','mission','revision','mistakes','current_affairs','challenge','session') NOT NULL,
    track ENUM('academic','admission','job') NULL,
    exam_id INT NULL,
    duration_sec INT NOT NULL DEFAULT 0,
    negative_mark DECIMAL(4,2) NOT NULL DEFAULT 0,
    instant_feedback TINYINT(1) NOT NULL DEFAULT 0,
    is_public TINYINT(1) NOT NULL DEFAULT 0,
    starts_at DATETIME NULL,
    ends_at DATETIME NULL,
    meta JSON NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_t_kind (kind, starts_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS test_questions (
    test_id INT NOT NULL,
    question_id INT NOT NULL,
    position INT NOT NULL,
    PRIMARY KEY (test_id, question_id),
    FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    test_id INT NOT NULL,
    status ENUM('in_progress','submitted') NOT NULL DEFAULT 'in_progress',
    started_at DATETIME NOT NULL,
    submitted_at DATETIME NULL,
    total INT NOT NULL DEFAULT 0,
    correct INT NOT NULL DEFAULT 0,
    wrong INT NOT NULL DEFAULT 0,
    skipped INT NOT NULL DEFAULT 0,
    score DECIMAL(7,2) NOT NULL DEFAULT 0,
    time_spent_sec INT NOT NULL DEFAULT 0,
    xp_earned INT NOT NULL DEFAULT 0,
    flagged TINYINT(1) NOT NULL DEFAULT 0,
    INDEX idx_a_user (user_id, submitted_at),
    INDEX idx_a_test (test_id, status),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Per-answer telemetry: the raw material for mistake intelligence.
  `CREATE TABLE IF NOT EXISTS attempt_answers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    attempt_id INT NOT NULL,
    user_id INT NOT NULL,
    question_id INT NOT NULL,
    position INT NOT NULL,
    selected_option CHAR(1) NULL,
    is_correct TINYINT(1) NOT NULL DEFAULT 0,
    time_ms INT NOT NULL DEFAULT 0,
    answered_at_sec INT NULL,
    confidence ENUM('sure','unsure','guess') NULL,
    changed_answer TINYINT(1) NOT NULL DEFAULT 0,
    mistake_type VARCHAR(30) NULL,
    mistake_type_user VARCHAR(30) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_attempt_q (attempt_id, question_id),
    INDEX idx_aa_user_q (user_id, question_id),
    FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Spaced-repetition memory state per user × question (Leitner boxes).
  `CREATE TABLE IF NOT EXISTS review_items (
    user_id INT NOT NULL,
    question_id INT NOT NULL,
    box TINYINT NOT NULL DEFAULT 0,
    due_date DATE NOT NULL,
    times_wrong INT NOT NULL DEFAULT 0,
    times_right INT NOT NULL DEFAULT 0,
    last_mistake_type VARCHAR(30) NULL,
    last_seen_at DATETIME NULL,
    mastered TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, question_id),
    INDEX idx_ri_due (user_id, mastered, due_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS daily_missions (
    user_id INT NOT NULL,
    mission_date DATE NOT NULL,
    items JSON NOT NULL,
    PRIMARY KEY (user_id, mission_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS bookmarks (
    user_id INT NOT NULL,
    question_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, question_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS question_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question_id INT NOT NULL,
    user_id INT NOT NULL,
    reason ENUM('wrong_answer','outdated','ambiguous','typo','bad_explanation','duplicate','other') NOT NULL,
    note TEXT NULL,
    status ENUM('open','verified_ok','fixed','rejected') NOT NULL DEFAULT 'open',
    resolution_note TEXT NULL,
    resolved_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS discussions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question_id INT NOT NULL,
    user_id INT NOT NULL,
    body TEXT NOT NULL,
    score INT NOT NULL DEFAULT 0,
    is_verified TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_d_q (question_id),
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS discussion_votes (
    discussion_id INT NOT NULL,
    user_id INT NOT NULL,
    value TINYINT NOT NULL,
    PRIMARY KEY (discussion_id, user_id),
    FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS coach_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    role ENUM('user','assistant') NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cm_user (user_id, id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

// ---------- Billing (release 2) ----------
schema.push(
  `CREATE TABLE IF NOT EXISTS plans (
    code VARCHAR(40) PRIMARY KEY,
    name_bn VARCHAR(120) NOT NULL,
    price_bdt INT NOT NULL,
    duration_days INT NOT NULL,
    includes_ai_coach TINYINT(1) NOT NULL DEFAULT 1,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    highlight VARCHAR(80) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    plan_code VARCHAR(40) NOT NULL,
    amount_bdt INT NOT NULL,
    method ENUM('bkash_gateway','manual_bkash','manual_nagad','manual_rocket','demo') NOT NULL,
    status ENUM('pending','paid','failed','cancelled','rejected','refunded') NOT NULL DEFAULT 'pending',
    gateway_payment_id VARCHAR(120) NULL,
    trx_id VARCHAR(60) NULL,
    sender_number VARCHAR(20) NULL,
    note VARCHAR(255) NULL,
    admin_note VARCHAR(255) NULL,
    reviewed_by INT NULL,
    raw JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME NULL,
    UNIQUE KEY uq_trx (method, trx_id),
    INDEX idx_pay_user (user_id, created_at),
    INDEX idx_pay_status (status),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    plan_code VARCHAR(40) NOT NULL,
    payment_id INT NULL,
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    status ENUM('active','refunded','cancelled') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sub_user (user_id, ends_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
);

// Columns added after the first release: [table, column, definition]
export const columns = [
  ['users', 'trial_ends_at', 'DATETIME NULL'],
];

// ---------- Release 3: OTP, achievements ----------
schema.push(
  `CREATE TABLE IF NOT EXISTS otp_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    purpose ENUM('reset_password') NOT NULL,
    code_hash VARCHAR(100) NOT NULL,
    channel ENUM('email','sms','dev') NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_otp_user (user_id, purpose, created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS user_badges (
    user_id INT NOT NULL,
    code VARCHAR(40) NOT NULL,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    seen TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, code),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
);
columns.push(['users', 'weekly_goal', 'INT NULL']);

// ---------- Release 4: written answers & viva ----------
schema.push(
  `CREATE TABLE IF NOT EXISTS written_prompts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    track ENUM('academic','admission','job') NOT NULL,
    exam_id INT NULL,
    subject_id INT NULL,
    title VARCHAR(255) NOT NULL,
    prompt TEXT NOT NULL,
    marks INT NOT NULL DEFAULT 10,
    word_limit INT NOT NULL DEFAULT 300,
    time_min INT NOT NULL DEFAULT 20,
    key_points JSON NULL,
    model_answer TEXT NULL,
    rubric JSON NOT NULL,
    source VARCHAR(160) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_wp_track (track, is_active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS written_submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    prompt_id INT NOT NULL,
    answer TEXT NOT NULL,
    word_count INT NOT NULL,
    time_spent_sec INT NOT NULL DEFAULT 0,
    auto_feedback JSON NULL,
    auto_score DECIMAL(5,2) NULL,
    auto_engine ENUM('ai','heuristic') NULL,
    expert_requested TINYINT(1) NOT NULL DEFAULT 0,
    expert_id INT NULL,
    expert_score DECIMAL(5,2) NULL,
    expert_feedback TEXT NULL,
    expert_at DATETIME NULL,
    allow_peer TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ws_user (user_id, created_at),
    INDEX idx_ws_prompt (prompt_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (prompt_id) REFERENCES written_prompts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS peer_reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    submission_id INT NOT NULL,
    reviewer_id INT NOT NULL,
    scores JSON NOT NULL,
    total DECIMAL(5,2) NOT NULL,
    comment TEXT NULL,
    helpful TINYINT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_peer (submission_id, reviewer_id),
    FOREIGN KEY (submission_id) REFERENCES written_submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS viva_questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    track ENUM('academic','admission','job') NOT NULL,
    exam_id INT NULL,
    category ENUM('personal','motivation','bangladesh','liberation','constitution','current','international','subject','situational','district') NOT NULL,
    question TEXT NOT NULL,
    guidance TEXT NULL,
    key_points JSON NULL,
    follow_ups JSON NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS viva_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    exam_id INT NULL,
    question_ids JSON NOT NULL,
    status ENUM('in_progress','completed') NOT NULL DEFAULT 'in_progress',
    summary JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS viva_answers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    question_id INT NULL,
    question_text TEXT NOT NULL,
    is_follow_up TINYINT(1) NOT NULL DEFAULT 0,
    answer TEXT NOT NULL,
    duration_sec INT NOT NULL DEFAULT 0,
    input_mode ENUM('voice','text') NOT NULL DEFAULT 'text',
    feedback JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES viva_sessions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
);

// ---------- Release 5: battles, groups/batches, referrals ----------
schema.push(
  `CREATE TABLE IF NOT EXISTS battles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(12) NOT NULL UNIQUE,
    test_id INT NOT NULL,
    creator_id INT NOT NULL,
    opponent_id INT NULL,
    is_open TINYINT(1) NOT NULL DEFAULT 0,
    status ENUM('waiting','active','finished','expired') NOT NULL DEFAULT 'waiting',
    per_question_sec INT NOT NULL DEFAULT 20,
    started_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_b_open (is_open, status),
    FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS battle_answers (
    battle_id INT NOT NULL,
    user_id INT NOT NULL,
    question_id INT NOT NULL,
    selected CHAR(1) NULL,
    is_correct TINYINT(1) NOT NULL DEFAULT 0,
    time_ms INT NOT NULL DEFAULT 0,
    PRIMARY KEY (battle_id, user_id, question_id),
    FOREIGN KEY (battle_id) REFERENCES battles(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS study_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kind ENUM('group','batch') NOT NULL DEFAULT 'group',
    name VARCHAR(120) NOT NULL,
    description VARCHAR(500) NULL,
    code VARCHAR(12) NOT NULL UNIQUE,
    owner_id INT NOT NULL,
    exam_id INT NULL,
    is_public TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS group_members (
    group_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('owner','teacher','member') NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id),
    INDEX idx_gm_user (user_id),
    FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS group_posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    user_id INT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_gp (group_id, id),
    FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS group_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    test_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    due_at DATETIME NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
);
columns.push(
  ['users', 'referral_code', 'VARCHAR(12) NULL UNIQUE'],
  ['users', 'referred_by', 'INT NULL'],
  ['users', 'referral_rewarded', 'TINYINT(1) NOT NULL DEFAULT 0'],
);

// ---------- Release 6: creator marketplace, toppers & mentors ----------
schema.push(
  `CREATE TABLE IF NOT EXISTS creator_profiles (
    user_id INT PRIMARY KEY,
    display_name VARCHAR(120) NOT NULL,
    bio TEXT NULL,
    credential VARCHAR(255) NULL,
    evidence_url VARCHAR(500) NULL,
    verified TINYINT(1) NOT NULL DEFAULT 0,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    payout_method VARCHAR(20) NULL,
    payout_number VARCHAR(20) NULL,
    admin_note VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    creator_id INT NOT NULL,
    type ENUM('question_set','model_test') NOT NULL DEFAULT 'question_set',
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    track ENUM('academic','admission','job') NOT NULL,
    exam_id INT NULL,
    subject_id INT NULL,
    price_bdt INT NOT NULL DEFAULT 0,
    duration_min INT NULL,
    status ENUM('draft','review','published','rejected','unlisted') NOT NULL DEFAULT 'draft',
    admin_note VARCHAR(255) NULL,
    sales INT NOT NULL DEFAULT 0,
    rating_sum INT NOT NULL DEFAULT 0,
    rating_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME NULL,
    INDEX idx_p_status (status, track),
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS product_questions (
    product_id INT NOT NULL,
    question_id INT NOT NULL,
    position INT NOT NULL,
    PRIMARY KEY (product_id, question_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    payment_id INT NULL,
    price_bdt INT NOT NULL,
    creator_share_bdt DECIMAL(10,2) NOT NULL DEFAULT 0,
    status ENUM('active','refunded') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_purchase (user_id, product_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS product_reviews (
    product_id INT NOT NULL,
    user_id INT NOT NULL,
    rating TINYINT NOT NULL,
    comment TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (product_id, user_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS creator_payouts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    creator_id INT NOT NULL,
    amount_bdt DECIMAL(10,2) NOT NULL,
    method VARCHAR(20) NULL,
    reference VARCHAR(80) NULL,
    paid_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS topper_stories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    track ENUM('academic','admission','job') NOT NULL,
    exam_label VARCHAR(160) NOT NULL,
    result_claim VARCHAR(255) NOT NULL,
    evidence_url VARCHAR(500) NULL,
    title VARCHAR(200) NOT NULL,
    routine TEXT NULL,
    story TEXT NOT NULL,
    tips JSON NULL,
    status ENUM('pending','published','rejected') NOT NULL DEFAULT 'pending',
    verified_by INT NULL,
    admin_note VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ama_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mentor_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    track ENUM('academic','admission','job') NULL,
    starts_at DATETIME NOT NULL,
    status ENUM('upcoming','open','closed') NOT NULL DEFAULT 'upcoming',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mentor_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ama_questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    user_id INT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NULL,
    votes INT NOT NULL DEFAULT 0,
    answered_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES ama_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ama_votes (
    question_id INT NOT NULL,
    user_id INT NOT NULL,
    PRIMARY KEY (question_id, user_id),
    FOREIGN KEY (question_id) REFERENCES ama_questions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
);
columns.push(['payments', 'product_id', 'INT NULL']);

// Column definitions changed after release: [table, column, full new definition, substring that must be present]
export const modifications = [
  // 'product' = question that belongs to a paid/creator set and must stay out of the general bank.
  ['questions', 'status', "ENUM('active','needs_review','retired','product') NOT NULL DEFAULT 'active'", "'product'"],
];

// ---------- Release 7: public quiz (no login) ----------
schema.push(
  `CREATE TABLE IF NOT EXISTS public_plays (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kind ENUM('daily','subject','challenge') NOT NULL,
    quiz_key VARCHAR(60) NOT NULL,
    track ENUM('academic','admission','job') NULL,
    question_ids JSON NOT NULL,
    score INT NOT NULL,
    total INT NOT NULL,
    time_sec INT NOT NULL DEFAULT 0,
    nickname VARCHAR(30) NULL,
    challenge_code VARCHAR(12) NULL UNIQUE,
    ip_hash VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pp_key (quiz_key, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS public_qotd_answers (
    qotd_date DATE NOT NULL,
    track ENUM('academic','admission','job') NOT NULL,
    question_id INT NOT NULL,
    is_correct TINYINT(1) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_qa (qotd_date, track)
  ) ENGINE=InnoDB`,
);
columns.push(['users', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1']);

// ---------- Release 8: link exams (Google-Form-style, built by staff in the quiz app) ----------
schema.push(
  `CREATE TABLE IF NOT EXISTS exam_forms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_id INT NOT NULL,
    code VARCHAR(12) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    status ENUM('draft','live','closed') NOT NULL DEFAULT 'draft',
    duration_min INT NOT NULL DEFAULT 0,
    marks_per_q DECIMAL(6,2) NOT NULL DEFAULT 1,
    negative_mark DECIMAL(6,2) NOT NULL DEFAULT 0,
    pass_mark DECIMAL(8,2) NULL,
    shuffle_questions TINYINT(1) NOT NULL DEFAULT 0,
    shuffle_options TINYINT(1) NOT NULL DEFAULT 0,
    one_attempt TINYINT(1) NOT NULL DEFAULT 1,
    show_result ENUM('immediate','after_end','never') NOT NULL DEFAULT 'immediate',
    show_answers TINYINT(1) NOT NULL DEFAULT 1,
    show_leaderboard TINYINT(1) NOT NULL DEFAULT 1,
    password VARCHAR(60) NULL,
    starts_at DATETIME NULL,
    ends_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ef_owner (owner_id),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS exam_form_questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    form_id INT NOT NULL,
    position INT NOT NULL DEFAULT 0,
    type ENUM('single','multi','text') NOT NULL DEFAULT 'single',
    body TEXT NOT NULL,
    image MEDIUMTEXT NULL,
    options JSON NULL,
    answer JSON NOT NULL,
    marks DECIMAL(6,2) NULL,
    explanation TEXT NULL,
    INDEX idx_efq_form (form_id, position),
    FOREIGN KEY (form_id) REFERENCES exam_forms(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS exam_form_submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    form_id INT NOT NULL,
    token VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL,
    name_key VARCHAR(80) NOT NULL,
    device VARCHAR(40) NULL,
    ip_hash VARCHAR(64) NULL,
    status ENUM('in_progress','submitted') NOT NULL DEFAULT 'in_progress',
    question_order JSON NOT NULL,
    answers JSON NULL,
    started_at DATETIME NOT NULL,
    deadline_at DATETIME NULL,
    submitted_at DATETIME NULL,
    time_sec INT NULL,
    score DECIMAL(8,2) NULL,
    total_marks DECIMAL(8,2) NULL,
    correct INT NULL, wrong INT NULL, skipped INT NULL,
    INDEX idx_efs_form (form_id, status, score),
    INDEX idx_efs_name (form_id, name_key),
    FOREIGN KEY (form_id) REFERENCES exam_forms(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
);
columns.push(
  ['exam_form_submissions', 'phone', 'VARCHAR(20) NULL'],
  ['exam_form_submissions', 'email', 'VARCHAR(120) NULL'],
  ['exam_form_submissions', 'district', 'VARCHAR(60) NULL'],
  ['exam_forms', 'leaderboard_limit', 'INT NOT NULL DEFAULT 50'],
);
