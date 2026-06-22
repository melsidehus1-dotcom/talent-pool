/* ============================================================
   Candidate Skill Detection & Scoring Engine
   Analyzes CV/profile text against Fullstack Developer 
   (Cloud & Email Infrastructure) job requirements.
   ============================================================ */

const SkillAnalyzer = (() => {

  // ── Job Requirement Categories ──────────────────────────────
  // Each category has: name, weight (required=2, preferred=1),
  // and keyword groups with contextual scoring.

  const CATEGORIES = [
    {
      id: 'fullstack',
      name: 'Fullstack Development',
      icon: '🖥️',
      weight: 2, // REQUIRED
      description: 'Backend-focused fullstack experience',
      keywords: [
        // High-value keywords (direct match to requirement)
        { terms: ['fullstack', 'full-stack', 'full stack'], score: 15 },
        { terms: ['backend', 'back-end', 'back end', 'server-side', 'server side'], score: 12 },
        { terms: ['frontend', 'front-end', 'front end', 'client-side'], score: 8 },
        { terms: ['rest api', 'restful', 'graphql', 'grpc', 'websocket'], score: 10 },
        { terms: ['mvc', 'microservice', 'microservices', 'monolith'], score: 8 },
        { terms: ['web application', 'web app', 'web development', 'web developer'], score: 10 },
        { terms: ['database', 'sql', 'nosql', 'mongodb', 'postgresql', 'mysql', 'redis', 'dynamodb'], score: 8 },
        { terms: ['orm', 'prisma', 'sequelize', 'typeorm', 'sqlalchemy', 'gorm'], score: 6 },
        { terms: ['authentication', 'authorization', 'oauth', 'jwt', 'session'], score: 6 },
        { terms: ['caching', 'cache', 'memcached'], score: 5 },
        { terms: ['message queue', 'rabbitmq', 'kafka', 'sqs', 'pub/sub'], score: 6 },
        { terms: ['scalable', 'scalability', 'high availability', 'load balancing'], score: 7 },
      ],
      maxScore: 80,
    },
    {
      id: 'aws',
      name: 'AWS Expertise',
      icon: '☁️',
      weight: 2, // REQUIRED
      description: 'EC2, S3, RDS, Lambda, VPC',
      keywords: [
        { terms: ['aws', 'amazon web services'], score: 15 },
        { terms: ['ec2', 'elastic compute'], score: 12 },
        { terms: ['s3', 'simple storage service'], score: 10 },
        { terms: ['rds', 'relational database service', 'aurora'], score: 10 },
        { terms: ['lambda', 'serverless'], score: 10 },
        { terms: ['vpc', 'virtual private cloud', 'subnet'], score: 10 },
        { terms: ['cloudfront', 'cdn'], score: 6 },
        { terms: ['route 53', 'route53'], score: 6 },
        { terms: ['iam', 'identity and access'], score: 8 },
        { terms: ['cloudwatch', 'monitoring'], score: 6 },
        { terms: ['elastic beanstalk', 'ecs', 'fargate', 'eks'], score: 7 },
        { terms: ['api gateway'], score: 6 },
        { terms: ['sns', 'sqs', 'eventbridge'], score: 6 },
        { terms: ['dynamodb'], score: 6 },
        { terms: ['cloudformation', 'cdk', 'sam'], score: 6 },
      ],
      maxScore: 90,
    },
    {
      id: 'email',
      name: 'Email Infrastructure',
      icon: '📧',
      weight: 2, // REQUIRED
      description: 'SES, cold email, SPF/DKIM/DMARC',
      keywords: [
        { terms: ['ses', 'amazon ses', 'simple email service'], score: 20 },
        { terms: ['cold email', 'email campaign', 'email marketing', 'mass email', 'bulk email'], score: 15 },
        { terms: ['spf', 'sender policy framework'], score: 12 },
        { terms: ['dkim', 'domainkeys'], score: 12 },
        { terms: ['dmarc'], score: 12 },
        { terms: ['deliverability', 'email deliverability', 'inbox placement'], score: 10 },
        { terms: ['smtp', 'mail server', 'mail transfer'], score: 8 },
        { terms: ['email automation', 'drip campaign', 'email sequence', 'email workflow'], score: 10 },
        { terms: ['bounce', 'bounce rate', 'complaint', 'suppression'], score: 6 },
        { terms: ['sendgrid', 'mailgun', 'postmark', 'mailchimp'], score: 5 },
        { terms: ['email warm', 'warm up', 'warmup', 'ip reputation'], score: 8 },
      ],
      maxScore: 85,
    },
    {
      id: 'server',
      name: 'Server Administration',
      icon: '🖧',
      weight: 2, // REQUIRED
      description: 'Linux, uptime, security & performance',
      keywords: [
        { terms: ['linux', 'ubuntu', 'centos', 'debian', 'rhel', 'amazon linux'], score: 15 },
        { terms: ['nginx', 'apache', 'reverse proxy', 'load balancer'], score: 10 },
        { terms: ['ssh', 'shell', 'bash', 'command line', 'terminal', 'cli'], score: 8 },
        { terms: ['server administration', 'sysadmin', 'system admin', 'devops'], score: 12 },
        { terms: ['uptime', '99.9', 'high availability', 'sla'], score: 10 },
        { terms: ['monitoring', 'alerting', 'prometheus', 'grafana', 'datadog', 'nagios'], score: 8 },
        { terms: ['firewall', 'iptables', 'security group', 'ufw'], score: 7 },
        { terms: ['ssl', 'tls', 'https', 'certificate', 'lets encrypt', "let's encrypt"], score: 6 },
        { terms: ['cron', 'systemd', 'process manager', 'pm2', 'supervisor'], score: 6 },
        { terms: ['backup', 'disaster recovery', 'failover'], score: 6 },
        { terms: ['performance tuning', 'optimization', 'bottleneck'], score: 7 },
      ],
      maxScore: 75,
    },
    {
      id: 'frontend',
      name: 'Frontend Frameworks',
      icon: '🎨',
      weight: 1, // PREFERRED
      description: 'React, Vue, or Next.js',
      keywords: [
        { terms: ['react', 'reactjs', 'react.js'], score: 15 },
        { terms: ['vue', 'vuejs', 'vue.js'], score: 15 },
        { terms: ['next.js', 'nextjs', 'next js'], score: 15 },
        { terms: ['nuxt', 'nuxtjs'], score: 10 },
        { terms: ['angular', 'angularjs'], score: 8 },
        { terms: ['svelte', 'sveltekit'], score: 8 },
        { terms: ['typescript', 'ts'], score: 8 },
        { terms: ['javascript', 'js', 'es6', 'ecmascript'], score: 6 },
        { terms: ['html', 'css', 'sass', 'scss', 'less', 'tailwind', 'bootstrap'], score: 5 },
        { terms: ['redux', 'vuex', 'pinia', 'zustand', 'state management'], score: 6 },
        { terms: ['webpack', 'vite', 'rollup', 'esbuild', 'bundler'], score: 5 },
        { terms: ['responsive', 'mobile-first', 'pwa', 'spa', 'ssr'], score: 5 },
      ],
      maxScore: 70,
    },
    {
      id: 'backend_lang',
      name: 'Backend Languages',
      icon: '⚙️',
      weight: 1, // PREFERRED
      description: 'Node.js, Python, or Go',
      keywords: [
        { terms: ['node.js', 'nodejs', 'node js'], score: 15 },
        { terms: ['python'], score: 15 },
        { terms: ['go', 'golang'], score: 15 },
        { terms: ['express', 'expressjs', 'fastify', 'nestjs', 'nest.js', 'koa'], score: 10 },
        { terms: ['django', 'flask', 'fastapi'], score: 10 },
        { terms: ['gin', 'echo', 'fiber', 'gorilla'], score: 10 },
        { terms: ['java', 'spring', 'spring boot'], score: 6 },
        { terms: ['php', 'laravel', 'symfony', 'codeigniter'], score: 5 },
        { terms: ['ruby', 'rails', 'ruby on rails'], score: 5 },
        { terms: ['.net', 'c#', 'asp.net'], score: 5 },
        { terms: ['rust', 'elixir', 'scala', 'kotlin'], score: 5 },
      ],
      maxScore: 65,
    },
    {
      id: 'devops',
      name: 'DevOps & Containers',
      icon: '🐳',
      weight: 1, // PREFERRED
      description: 'Docker, Kubernetes, CI/CD',
      keywords: [
        { terms: ['docker', 'dockerfile', 'docker-compose', 'container'], score: 15 },
        { terms: ['kubernetes', 'k8s', 'kubectl', 'helm'], score: 15 },
        { terms: ['ci/cd', 'ci cd', 'continuous integration', 'continuous deployment', 'continuous delivery'], score: 12 },
        { terms: ['jenkins', 'github actions', 'gitlab ci', 'circleci', 'travis', 'bitbucket pipeline'], score: 8 },
        { terms: ['terraform', 'infrastructure as code', 'iac', 'pulumi'], score: 8 },
        { terms: ['ansible', 'chef', 'puppet', 'salt'], score: 6 },
        { terms: ['argocd', 'flux', 'gitops'], score: 6 },
        { terms: ['registry', 'ecr', 'docker hub', 'container registry'], score: 5 },
        { terms: ['pipeline', 'deployment', 'automated deployment', 'release'], score: 6 },
      ],
      maxScore: 65,
    },
    {
      id: 'security',
      name: 'Cloud Security',
      icon: '🔒',
      weight: 1, // PREFERRED
      description: 'Security best practices',
      keywords: [
        { terms: ['iam', 'identity and access management', 'rbac', 'role-based'], score: 12 },
        { terms: ['encryption', 'kms', 'at rest', 'in transit', 'aes'], score: 10 },
        { terms: ['firewall', 'waf', 'web application firewall', 'security group'], score: 10 },
        { terms: ['ssl', 'tls', 'https', 'certificate'], score: 8 },
        { terms: ['security', 'cybersecurity', 'infosec', 'information security'], score: 10 },
        { terms: ['compliance', 'gdpr', 'hipaa', 'soc2', 'pci', 'iso 27001'], score: 8 },
        { terms: ['vulnerability', 'penetration testing', 'pentest', 'owasp'], score: 8 },
        { terms: ['secrets management', 'vault', 'aws secrets', 'parameter store'], score: 7 },
        { terms: ['audit', 'cloudtrail', 'logging', 'security audit'], score: 6 },
        { terms: ['zero trust', 'least privilege', 'mfa', 'multi-factor'], score: 7 },
      ],
      maxScore: 60,
    },
    {
      id: 'problem_solving',
      name: 'Problem Solving',
      icon: '🧩',
      weight: 2, // REQUIRED
      description: 'Problem-solving & optimization skills',
      keywords: [
        { terms: ['optimization', 'optimize', 'performance optimization', 'tuning'], score: 12 },
        { terms: ['scalable', 'scalability', 'scale', 'high traffic', 'high volume'], score: 10 },
        { terms: ['architecture', 'system design', 'design pattern', 'architect'], score: 12 },
        { terms: ['debugging', 'troubleshoot', 'troubleshooting', 'root cause'], score: 8 },
        { terms: ['algorithm', 'data structure'], score: 8 },
        { terms: ['performance', 'latency', 'throughput', 'benchmark'], score: 8 },
        { terms: ['refactor', 'refactoring', 'code quality', 'clean code', 'best practice'], score: 7 },
        { terms: ['problem solving', 'problem-solving', 'analytical'], score: 10 },
        { terms: ['leadership', 'lead', 'team lead', 'tech lead', 'mentor'], score: 6 },
        { terms: ['agile', 'scrum', 'kanban', 'sprint'], score: 4 },
      ],
      maxScore: 65,
    },
  ];

  // ── Experience Level Detection ──────────────────────────────

  function detectExperience(text) {
    const lower = text.toLowerCase();
    const patterns = [
      /(\d+)\+?\s*(?:years?|yrs?|tahun)\s*(?:of\s*)?(?:experience|exp|pengalaman|kerja)/gi,
      /(?:experience|exp|pengalaman)\s*(?:of\s*)?(\d+)\+?\s*(?:years?|yrs?|tahun)/gi,
      /(\d+)\+?\s*(?:years?|yrs?|tahun)\s*(?:in\s*(?:software|web|fullstack|backend|frontend|cloud|devops|it|tech))/gi,
    ];

    let maxYears = 0;
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(lower)) !== null) {
        const years = parseInt(match[1], 10);
        if (years > 0 && years < 50) {
          maxYears = Math.max(maxYears, years);
        }
      }
    }
    return maxYears;
  }

  // ── Name Detection ──────────────────────────────────────────

  function detectName(text) {
    // Strategy 1: Look for explicit name labels
    const labelPatterns = [
      /(?:^|\n)\s*(?:name|nama|full\s*name|nama\s*lengkap)\s*[:\-\|]\s*([A-Za-z][A-Za-z\s'.,-]{2,40})/im,
      /(?:^|\n)\s*(?:name|nama|full\s*name)\s+([A-Z][A-Za-z\s'.,-]{2,40})/im,
    ];
    for (const pattern of labelPatterns) {
      const match = text.match(pattern);
      if (match) {
        const name = match[1].trim().replace(/\s+/g, ' ');
        if (isLikelyName(name)) return cleanName(name);
      }
    }

    // Strategy 2: Scan first lines of text
    // Handle both proper newlines and PDF text (split on double+ spaces too)
    let lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // If we got very few lines, the text might be concatenated — try splitting long lines
    if (lines.length < 5 && lines[0] && lines[0].length > 100) {
      const expanded = [];
      for (const line of lines) {
        // Split on double spaces, pipes, tabs — common PDF artifacts
        const parts = line.split(/\s{2,}|\t|\|/).map(p => p.trim()).filter(p => p.length > 0);
        expanded.push(...parts);
      }
      lines = expanded;
    }

    // Check first 10 segments for a name-like string
    const skipPatterns = [
      /^(curriculum|resume|cv|portfolio|about|profile|contact|email|phone|address|summary|objective|experience|education|skill|work|personal|data|diri|riwayat|informasi)/i,
      /@/,
      /^https?:\/\//i,
      /^(linkedin|github|twitter|website|www\.)/i,
      /^\d{4}/, // starts with year
      /^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)/i,
    ];

    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const line = lines[i];
      
      // Skip lines that match skip patterns
      let skip = false;
      for (const pat of skipPatterns) {
        if (pat.test(line)) { skip = true; break; }
      }
      if (skip) continue;

      // Skip lines that are too short or too long
      if (line.length < 3 || line.length > 50) continue;
      
      // Skip lines that look like phone numbers
      if (/^[\d\+\(\)\-\s]{7,}$/.test(line)) continue;

      // Check if it looks like a name (2-5 words, mostly letters)
      const cleaned = line.replace(/[,|:;]/g, '').trim();
      if (isLikelyName(cleaned)) {
        return cleanName(cleaned);
      }
    }

    // Strategy 3: LinkedIn-style patterns
    const linkedinMatch = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})\s*(?:\n|–|-|·|\|)/m);
    if (linkedinMatch && isLikelyName(linkedinMatch[1])) {
      return cleanName(linkedinMatch[1]);
    }

    // Strategy 4: Find the first capitalized multi-word sequence in the text
    const capMatch = text.match(/([A-Z][a-zA-Z'.]+(?:\s+[A-Z][a-zA-Z'.]+){1,4})/);
    if (capMatch && isLikelyName(capMatch[1])) {
      return cleanName(capMatch[1]);
    }

    return 'Unknown Candidate';
  }

  function isLikelyName(str) {
    if (!str || str.length < 3 || str.length > 50) return false;
    const words = str.split(/\s+/);
    if (words.length < 1 || words.length > 6) return false;
    // Allow letters, dots, apostrophes, hyphens, spaces
    if (!/^[A-Za-z][A-Za-z\s'.\-,]+$/.test(str)) return false;
    // At least one word should be 2+ chars
    if (!words.some(w => w.replace(/[^A-Za-z]/g, '').length >= 2)) return false;
    // Should not be a common non-name word
    const nonNames = ['curriculum', 'vitae', 'resume', 'summary', 'profile', 'experience', 'education', 'skills', 'about', 'contact', 'address', 'phone', 'email', 'objective', 'personal', 'data', 'information', 'references'];
    if (nonNames.includes(str.toLowerCase())) return false;
    if (words.length <= 2 && nonNames.includes(words[0].toLowerCase())) return false;
    return true;
  }

  function cleanName(name) {
    // Normalize whitespace, trim trailing dots/commas
    return name.replace(/\s+/g, ' ').replace(/[,.\s]+$/, '').trim();
  }

  // ── Contact Detection ───────────────────────────────────────

  function detectContact(text) {
    const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    const phone = text.match(/(?:\+?\d{1,4}[\s\-]?)?(?:\(?\d{2,4}\)?[\s\-]?)?\d{3,4}[\s\-]?\d{3,4}/);
    const linkedin = text.match(/(?:linkedin\.com\/in\/[\w-]+)/i);

    return {
      email: email ? email[0] : null,
      phone: phone ? phone[0].trim() : null,
      linkedin: linkedin ? 'https://' + linkedin[0] : null,
    };
  }

  // ── Core Analysis ───────────────────────────────────────────

  function analyze(text) {
    const lower = text.toLowerCase();
    const results = [];
    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const category of CATEGORIES) {
      let rawScore = 0;
      const matched = [];
      const allKeywords = [];

      for (const group of category.keywords) {
        let groupMatched = false;
        for (const term of group.terms) {
          allKeywords.push(term);
          // Use word-boundary-aware matching
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(?:^|[\\s,;.(/\\-])${escaped}(?:[\\s,;.)/\\-]|$)`, 'i');
          if (regex.test(lower)) {
            if (!groupMatched) {
              rawScore += group.score;
              groupMatched = true;
            }
            matched.push(term);
          }
        }
      }

      const percentage = Math.min(100, Math.round((rawScore / category.maxScore) * 100));
      
      results.push({
        id: category.id,
        name: category.name,
        icon: category.icon,
        description: category.description,
        weight: category.weight,
        isRequired: category.weight === 2,
        percentage,
        matchedKeywords: [...new Set(matched)],
        totalKeywords: [...new Set(allKeywords)],
      });

      totalWeightedScore += percentage * category.weight;
      totalWeight += category.weight;
    }

    const overallScore = Math.round(totalWeightedScore / totalWeight);
    const experience = detectExperience(text);
    const name = detectName(text);
    const contact = detectContact(text);

    // Determine verdict
    let verdict, verdictClass;
    if (overallScore >= 70) {
      verdict = 'GOOD FIT';
      verdictClass = 'good';
    } else if (overallScore >= 40) {
      verdict = 'MAYBE';
      verdictClass = 'maybe';
    } else {
      verdict = 'NOT FIT';
      verdictClass = 'not';
    }

    // Identify strengths & gaps
    const strengths = results
      .filter(r => r.percentage >= 60)
      .sort((a, b) => b.percentage - a.percentage)
      .map(r => `${r.icon} ${r.name} (${r.percentage}%)`);

    const gaps = results
      .filter(r => r.percentage < 40 && r.isRequired)
      .sort((a, b) => a.percentage - b.percentage)
      .map(r => `${r.icon} ${r.name} (${r.percentage}%)`);

    const warnings = results
      .filter(r => r.percentage < 40 && !r.isRequired)
      .sort((a, b) => a.percentage - b.percentage)
      .map(r => `${r.icon} ${r.name} (${r.percentage}%)`);

    return {
      name,
      contact,
      experience,
      overallScore,
      verdict,
      verdictClass,
      categories: results,
      strengths,
      gaps,
      warnings,
      analyzedAt: new Date().toISOString(),
      rawTextLength: text.length,
    };
  }

  // ── Public API ──────────────────────────────────────────────

  return {
    analyze,
    getCategories: () => CATEGORIES,
  };

})();
