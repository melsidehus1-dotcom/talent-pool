/* ============================================================
   Candidate Video Screening Analyzer Engine
   Analyzes candidate video transcripts against job requirements.
   Provides rule-based analysis and optional Gemini AI analysis.
   ============================================================ */

const VideoAnalyzer = (() => {

  const CATEGORIES = [
    {
      id: 'aws',
      name: 'AWS Experience',
      icon: '☁️',
      weight: 2,
      maxScore: 60,
      keywords: [
        { terms: ['aws', 'amazon web services'], score: 15 },
        { terms: ['ec2', 'elastic compute'], score: 10 },
        { terms: ['s3', 'simple storage'], score: 10 },
        { terms: ['rds', 'relational database'], score: 10 },
        { terms: ['lambda', 'serverless'], score: 10 },
        { terms: ['vpc', 'virtual private cloud', 'subnet'], score: 10 },
        { terms: ['route 53', 'route53'], score: 6 },
        { terms: ['cloudfront', 'cdn'], score: 6 },
        { terms: ['iam', 'identity and access'], score: 6 },
      ]
    },
    {
      id: 'ses',
      name: 'Amazon SES',
      icon: '📧',
      weight: 2,
      maxScore: 50,
      keywords: [
        { terms: ['ses', 'amazon ses', 'simple email service'], score: 20 },
        { terms: ['deliverability', 'inbox placement'], score: 12 },
        { terms: ['bounce', 'bounce rate', 'complaint', 'suppression list'], score: 10 },
        { terms: ['warm up', 'warmup', 'ip reputation', 'warming'], score: 10 },
        { terms: ['smtp', 'mail server'], score: 8 }
      ]
    },
    {
      id: 'email',
      name: 'Cold Email & Email Infrastructure',
      icon: '✉️',
      weight: 2,
      maxScore: 60,
      keywords: [
        { terms: ['cold email', 'bulk email', 'email campaign', 'outreach'], score: 15 },
        { terms: ['smtp', 'mail protocol'], score: 10 },
        { terms: ['spf', 'sender policy framework'], score: 12 },
        { terms: ['dkim', 'domainkeys'], score: 12 },
        { terms: ['dmarc'], score: 12 },
        { terms: ['automation', 'email sequence', 'instantly', 'lemlist', 'smartlead'], score: 8 },
        { terms: ['dns', 'mx record', 'txt record'], score: 8 }
      ]
    },
    {
      id: 'server',
      name: 'Server Management',
      icon: '🖧',
      weight: 2,
      maxScore: 50,
      keywords: [
        { terms: ['server', 'sysadmin', 'system administrator'], score: 10 },
        { terms: ['linux', 'ubuntu', 'debian', 'centos'], score: 15 },
        { terms: ['nginx', 'apache', 'reverse proxy'], score: 10 },
        { terms: ['ssh', 'bash', 'shell', 'cli', 'terminal'], score: 8 },
        { terms: ['uptime', 'monitoring', 'prometheus', 'grafana'], score: 8 },
        { terms: ['optimization', 'performance tuning', 'latency', 'caching'], score: 10 },
        { terms: ['security', 'firewall', 'ufw', 'fail2ban', 'ssl'], score: 8 }
      ]
    },
    {
      id: 'comm',
      name: 'Communication Quality',
      icon: '🗣️',
      weight: 1,
      maxScore: 40,
      keywords: [
        { terms: ['explain', 'understand', 'project', 'experience', 'build', 'create', 'solve', 'work on'], score: 8 },
        { terms: ['actually', 'basically', 'you know', 'i mean', 'like', 'well', 'so yeah'], score: 8 }, // Conversational cues
        { terms: ['english', 'speak', 'language'], score: 6 },
        { terms: ['code', 'screen', 'snippet', 'demo', 'show'], score: 8 }
      ]
    }
  ];

  // ── Conversational Tone Detector ────────────────────────────

  function detectTone(text) {
    const lower = text.toLowerCase();
    
    // Count conversational fillers (indicates natural/conversational speech)
    const fillers = ['actually', 'basically', 'like', 'you know', 'i mean', 'well', 'so yeah', 'pretty much', 'kind of', 'sort of'];
    let fillerCount = 0;
    fillers.forEach(f => {
      const regex = new RegExp(`\\b${f}\\b`, 'gi');
      const matches = lower.match(regex);
      if (matches) fillerCount += matches.length;
    });

    const totalWords = lower.split(/\s+/).length;
    const fillerDensity = (fillerCount / totalWords) * 100;

    // Look for rigid scripting markers (e.g. extremely structured lists, zero conversational items)
    if (fillerDensity === 0 && totalWords > 100) {
      return {
        label: 'Highly Scripted / Read',
        class: 'rehearsed',
        desc: 'The speech contains zero conversational markers. The candidate appears to be reading directly from a written script.'
      };
    } else if (fillerDensity < 0.3) {
      return {
        label: 'Somewhat Rehearsed',
        class: 'semi-rehearsed',
        desc: 'Few conversational fillers. The speech is structured, possibly rehearsed or read with high structure.'
      };
    } else if (fillerDensity >= 0.3 && fillerDensity < 1.5) {
      return {
        label: 'Conversational & Natural',
        class: 'natural',
        desc: 'A healthy balance of structured content and natural speech cues. Conversational and authentic presentation.'
      };
    } else {
      return {
        label: 'Very Spontaneous',
        class: 'natural',
        desc: 'Highly conversational with frequent spoken cues. Confident, unstructured, and genuine tone.'
      };
    }
  }

  // ── Rule-Based Text Analyzer ────────────────────────────────

  function analyze(transcript, cvResult = null) {
    const lower = transcript.toLowerCase();
    const categoriesAnalysis = [];
    let totalWeightedScore = 0;
    let totalWeight = 0;
    const matchedKeywords = [];

    // Analyze individual categories
    for (const cat of CATEGORIES) {
      let rawScore = 0;
      const matched = [];
      
      for (const group of cat.keywords) {
        let groupMatched = false;
        for (const term of group.terms) {
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'i');
          if (regex.test(lower)) {
            if (!groupMatched) {
              rawScore += group.score;
              groupMatched = true;
            }
            matched.push(term);
            matchedKeywords.push(term);
          }
        }
      }

      const percentage = Math.min(100, Math.round((rawScore / cat.maxScore) * 100));
      categoriesAnalysis.push({
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        weight: cat.weight,
        percentage: percentage,
        matchedKeywords: matched
      });

      totalWeightedScore += percentage * cat.weight;
      totalWeight += cat.weight;
    }

    const overallScore = Math.round(totalWeightedScore / totalWeight);

    // Fit verdict based on Video Score
    let verdict = 'NOT SCREENED';
    let verdictClass = 'not';
    if (overallScore >= 70) {
      verdict = 'VERBALLY STRONG';
      verdictClass = 'good';
    } else if (overallScore >= 45) {
      verdict = 'VERBALLY MODERATE';
      verdictClass = 'maybe';
    } else {
      verdict = 'VERBALLY WEAK';
      verdictClass = 'not';
    }

    // Tone analysis
    const toneInfo = detectTone(transcript);

    // Cross-reference with CV claims (veracity evaluation)
    const discrepancies = [];
    if (cvResult) {
      // If candidate CV claims AWS (>= 50%) but video has no AWS coverage (< 30%)
      const cvAws = cvResult.categories.find(c => c.id === 'aws')?.percentage || 0;
      const videoAws = categoriesAnalysis.find(c => c.id === 'aws')?.percentage || 0;
      if (cvAws >= 50 && videoAws < 30) {
        discrepancies.push('Claimed significant AWS experience on resume, but verbally shared little or no details.');
      }

      // SES claims
      const cvSes = cvResult.categories.find(c => c.id === 'email')?.percentage || 0; // email infra contains SES
      const videoSes = categoriesAnalysis.find(c => c.id === 'ses')?.percentage || 0;
      if (cvSes >= 50 && videoSes < 30) {
        discrepancies.push('Resume lists email infrastructure/SES skills, but verbally explained little to no SES experience.');
      }

      // Linux Server claims
      const cvServer = cvResult.categories.find(c => c.id === 'server')?.percentage || 0;
      const videoServer = categoriesAnalysis.find(c => c.id === 'server')?.percentage || 0;
      if (cvServer >= 50 && videoServer < 30) {
        discrepancies.push('Resume claims Linux/Server Administration, but Linux server topics were mostly skipped in the presentation.');
      }
    }

    // Extract projects mentioned (very basic sentence scraper as fallback)
    const projects = [];
    const projectRegex = /(?:project|worked on|built|created|deployed|managed)\s+([^.\n]+)/gi;
    let projectMatch;
    let count = 0;
    while ((projectMatch = projectRegex.exec(transcript)) !== null && count < 3) {
      const proj = projectMatch[1].trim();
      if (proj.length > 10 && proj.length < 80 && !projects.includes(proj)) {
        projects.push(proj);
        count++;
      }
    }

    // Dynamic Summary
    let summaryText = `The candidate verbally walks through their experience, covering key aspects of their technical background. `;
    if (overallScore >= 70) {
      summaryText += `They speak confidently and comprehensively about the technical requirements, showing strong practical expertise.`;
    } else if (overallScore >= 45) {
      summaryText += `They cover the main requirements moderately but skipped or had superficial explanations on some key technical points.`;
    } else {
      summaryText += `They struggled to speak comprehensively about the core topics requested (AWS, SES, server management).`;
    }

    return {
      overallScore,
      verdict,
      verdictClass,
      categories: categoriesAnalysis,
      tone: toneInfo.label,
      toneClass: toneInfo.class,
      toneDesc: toneInfo.desc,
      discrepancies,
      projects: projects.length > 0 ? projects : ['General background walkthrough'],
      summary: summaryText
    };
  }

  // ── Gemini AI Integration ───────────────────────────────────

  async function analyzeWithGemini(apiKey, transcript, cvResult = null) {
    const cvClaimsText = cvResult 
      ? `CV Claims:
- AWS Score: ${cvResult.categories.find(c => c.id === 'aws')?.percentage || 0}%
- Email/SES Claim: ${cvResult.categories.find(c => c.id === 'email')?.percentage || 0}%
- Linux Server Claim: ${cvResult.categories.find(c => c.id === 'server')?.percentage || 0}%` 
      : 'CV Claims: None provided';

    const systemPrompt = `You are an expert technical recruiter screening a candidate for a "Fullstack Developer (Cloud & Email Infrastructure)" role.
Analyze the candidate's spoken video transcript against the following requirements:
1. AWS Experience
2. Amazon SES Setup & Optimization
3. Cold Email & Email Infrastructure (SMTP, SPF, DKIM, DMARC)
4. Server Management (Linux, nginx, security, optimization)
5. Communication & Speaking Quality (conversational tone, genuine delivery vs reading a script)

Cross-reference their spoken claims with their ${cvClaimsText} to check if their verbal descriptions match their resume statements or if they seem to have padded their CV.

You MUST respond ONLY with a valid JSON object matching this structure:
{
  "overallScore": number (0-100),
  "verdict": "VERBALLY STRONG" or "VERBALLY MODERATE" or "VERBALLY WEAK",
  "verdictClass": "good" or "maybe" or "not",
  "categories": [
    { "id": "aws", "name": "AWS Experience", "percentage": number },
    { "id": "ses", "name": "Amazon SES", "percentage": number },
    { "id": "email", "name": "Cold Email & Email Infrastructure", "percentage": number },
    { "id": "server", "name": "Server Management", "percentage": number },
    { "id": "comm", "name": "Communication Quality", "percentage": number }
  ],
  "tone": "String describing speaking tone (e.g. Natural & Conversational, Scripted/Read, Rehearsed)",
  "toneDesc": "Brief analysis of communication tone (1-2 sentences)",
  "toneClass": "natural" or "rehearsed" or "semi-rehearsed",
  "discrepancies": ["String listing discrepancies/gaps between CV claims and spoken content, if any"],
  "projects": ["Short strings of specific projects the candidate mentioned in the video"],
  "summary": "Concise 2-3 sentence overview of candidate's video screening results."
}`;

    const userPrompt = `Candidate video transcript to analyze:
"""
${transcript}
"""`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: systemPrompt + '\\n\\n' + userPrompt }] }
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API returned status ${response.status}`);
      }

      const data = await response.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) {
        throw new Error('Empty response from Gemini API');
      }

      const parsed = JSON.parse(textResponse);
      
      // Ensure expected fields exist
      if (typeof parsed.overallScore !== 'number') throw new Error('Invalid JSON format from AI');
      
      return parsed;
    } catch (err) {
      console.error('Gemini video analysis failed. Falling back to local analysis.', err);
      // Fallback to local rule-based analysis
      const localResult = analyze(transcript, cvResult);
      localResult.summary = `(Local Fallback) ${localResult.summary} (Reason: ${err.message})`;
      return localResult;
    }
  }

  return {
    analyze,
    analyzeWithGemini
  };

})();
