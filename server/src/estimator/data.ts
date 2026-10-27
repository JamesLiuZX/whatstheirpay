// Reference data for the estimator. Every number here is a documented, editable assumption
// (summarized for users in web/methodology.html; keep the two in sync). Baselines are US national base salaries for a mid-level
// individual contributor at a typical company, in USD.

export const METHODOLOGY_VERSION = '2026.10';

export interface RoleFamily {
  id: string;
  label: string;
  /** Plural noun used in talk tracks: "Senior <noun> at Big Tech companies". */
  noun: string;
  base: number;
  /** Target variable pay as a share of base at mid level. */
  variable: number;
  variableKind: 'bonus' | 'commission';
  /** Relative equity intensity (1 = typical tech role). */
  equity: number;
  /** "X Manager" is an individual-contributor title in this family (Product Manager, Account Manager…). */
  managerIsIc?: boolean;
  /** Tech ladder: Manager/Lead titles map to staff level instead of senior. */
  tech?: boolean;
  /** Banking ladder: Analyst → Associate → VP → Director → MD. */
  banking?: boolean;
  /** How strongly pay follows local labor markets inside the US (1 = fully). */
  locationSensitivity?: number;
  /** Upper bound on confidence (some families are inherently noisy). */
  maxConfidence?: number;
  patterns: RegExp[];
}

const w = (s: string) => new RegExp(`\\b(?:${s})\\b`, 'i');

// Order matters: the first family whose pattern matches wins, so specific titles come first.
// `tech` families treat "Manager"/"Lead" as staff-level (4); elsewhere they map to senior (3).
export const ROLE_FAMILIES: RoleFamily[] = [
  { id: 'quant', label: 'Quant & Trading', noun: 'quantitative researchers and traders', base: 165_000, variable: 0.6, variableKind: 'bonus', equity: 0.2, tech: true, locationSensitivity: 0.5, patterns: [w('quant|quantitative (?:researcher|developer|analyst|trader|engineer|strategist)|trader|algorithmic trading|trading (?:engineer|developer|strategist)')] },
  { id: 'ml', label: 'ML & AI Engineering', noun: 'machine learning engineers', base: 150_000, variable: 0.12, variableKind: 'bonus', equity: 1.2, tech: true, patterns: [w('machine learning|ml|mle|deep learning|computer vision|nlp|llm|genai|gen ai|applied scientist|research engineer|ai (?:engineer|researcher|scientist|lead)')] },
  { id: 'data_science', label: 'Data Science', noun: 'data scientists', base: 128_000, variable: 0.1, variableKind: 'bonus', equity: 1.0, tech: true, patterns: [/\bdata scien|\bdecision scien/i] },
  { id: 'data_eng', label: 'Data Engineering', noun: 'data engineers', base: 130_000, variable: 0.1, variableKind: 'bonus', equity: 1.0, tech: true, patterns: [w('data engineer(?:ing)?|analytics engineer(?:ing)?|data architect|etl developer|big data')] },
  { id: 'analytics', label: 'Data & Analytics', noun: 'data analysts', base: 88_000, variable: 0.08, variableKind: 'bonus', equity: 0.5, tech: true, patterns: [w('data analyst|analytics|business intelligence|bi (?:analyst|developer|engineer)|insights analyst|reporting analyst')] },
  { id: 'security', label: 'Security Engineering', noun: 'security engineers', base: 128_000, variable: 0.1, variableKind: 'bonus', equity: 0.9, tech: true, patterns: [w('security|cyber ?security|infosec|penetration tester|pentester|soc analyst|appsec|ciso|chief information security officer')] },
  { id: 'infra', label: 'Infrastructure & DevOps', noun: 'infrastructure engineers', base: 130_000, variable: 0.1, variableKind: 'bonus', equity: 1.0, tech: true, patterns: [w('site reliability|sre|devops|dev ops|platform engineer(?:ing)?|infrastructure engineer(?:ing)?|cloud (?:engineer|architect)|systems engineer|network engineer|devsecops|kubernetes')] },
  { id: 'solutions', label: 'Solutions & Sales Engineering', noun: 'solutions engineers', base: 130_000, variable: 0.25, variableKind: 'commission', equity: 0.8, tech: true, patterns: [w('solutions? (?:engineer|architect|consultant)|sales engineer|pre-?sales|customer engineer|forward deployed(?: engineer)?')] },
  { id: 'it', label: 'IT & Systems', noun: 'IT professionals', base: 85_000, variable: 0.06, variableKind: 'bonus', equity: 0.3, patterns: [/\bIT\b/, w('system(?:s)? administrator|sysadmin|desktop support|network administrator|it (?:support|specialist|technician|analyst|administrator|consultant)|cio|chief information officer')] },
  { id: 'qa', label: 'QA & Test Engineering', noun: 'QA engineers', base: 98_000, variable: 0.08, variableKind: 'bonus', equity: 0.7, tech: true, patterns: [w('qa|quality assurance|test (?:engineer|automation|analyst)|sdet|tester')] },
  { id: 'hardware', label: 'Hardware & Physical Engineering', noun: 'hardware and physical engineers', base: 108_000, variable: 0.08, variableKind: 'bonus', equity: 0.6, tech: true, patterns: [w('mechanical|electrical|hardware|civil engineer|chemical engineer|manufacturing engineer|structural engineer|aerospace|industrial engineer|biomedical engineer|process engineer|asic|fpga|silicon|rf engineer|robotics')] },
  { id: 'swe', label: 'Software Engineering', noun: 'software engineers', base: 125_000, variable: 0.1, variableKind: 'bonus', equity: 1.0, tech: true, patterns: [w('software|developer|programmer|swe|sde|front[- ]?end|back[- ]?end|full[- ]?stack|ios|android|mobile engineer|web engineer|ui engineer|ux engineer|member of technical staff|mts|embedded|firmware|game engineer|engineering manager|head of engineering|(?:vp|director),? (?:of )?engineering|cto|chief technology officer')] },
  { id: 'tpm', label: 'Technical Program Management', noun: 'technical program managers', base: 138_000, variable: 0.12, variableKind: 'bonus', equity: 1.0, tech: true, managerIsIc: true, patterns: [w('technical program manager|tpm')] },
  { id: 'program', label: 'Program & Project Management', noun: 'program and project managers', base: 98_000, variable: 0.08, variableKind: 'bonus', equity: 0.4, managerIsIc: true, patterns: [w('program manager|project manager|scrum master|pmo|delivery manager|project lead')] },
  { id: 'design', label: 'Product Design & UX', noun: 'product designers', base: 112_000, variable: 0.08, variableKind: 'bonus', equity: 0.9, tech: true, patterns: [w('product designer|product design|ux|ui|user experience|interaction designer|design lead|design manager|head of design|(?:vp|director),? (?:of )?design|user researcher|content designer|service designer')] },
  { id: 'pm', label: 'Product Management', noun: 'product managers', base: 132_000, variable: 0.1, variableKind: 'bonus', equity: 1.0, tech: true, managerIsIc: true, patterns: [w('product manager|product owner|product lead|product management|head of product|(?:vp|director|chief),? (?:of )?product(?! design| marketing)|cpo|chief product officer|apm|pm')] },
  { id: 'visual_design', label: 'Brand & Visual Design', noun: 'brand and visual designers', base: 72_000, variable: 0.05, variableKind: 'bonus', equity: 0.4, patterns: [w('graphic designer|visual designer|brand designer|illustrator|motion designer|art director|creative director|video editor|animator|interior designer')] },
  { id: 'sdr', label: 'Sales Development', noun: 'sales development reps', base: 55_000, variable: 0.45, variableKind: 'commission', equity: 0.3, patterns: [w('sdr|bdr|sales development|business development rep(?:resentative)?|inside sales')] },
  { id: 'sales', label: 'Sales', noun: 'account executives', base: 80_000, variable: 0.9, variableKind: 'commission', equity: 0.5, managerIsIc: true, patterns: [w('account executive|ae|sales|account manager|account director|business development|partnerships?|channel manager|cro|chief revenue officer')] },
  { id: 'cs', label: 'Customer Success', noun: 'customer success managers', base: 80_000, variable: 0.15, variableKind: 'bonus', equity: 0.5, managerIsIc: true, patterns: [w('customer success|client success|csm|customer experience|implementation (?:manager|consultant|specialist)|onboarding (?:manager|specialist)|technical account manager|tam')] },
  { id: 'support', label: 'Customer Support', noun: 'customer support specialists', base: 50_000, variable: 0.05, variableKind: 'bonus', equity: 0.2, patterns: [w('customer (?:support|service|care)|support (?:specialist|agent|representative|associate)|technical support|call cent(?:er|re)|help ?desk')] },
  { id: 'pmm', label: 'Product Marketing', noun: 'product marketers', base: 125_000, variable: 0.1, variableKind: 'bonus', equity: 0.8, patterns: [w('product marketing|pmm')] },
  { id: 'growth', label: 'Growth & Performance Marketing', noun: 'growth marketers', base: 105_000, variable: 0.1, variableKind: 'bonus', equity: 0.7, patterns: [w('growth|performance marketing|demand gen(?:eration)?|paid (?:media|social|search|acquisition)|seo|sem|marketing operations|lifecycle|crm (?:manager|marketing)|user acquisition')] },
  { id: 'marketing', label: 'Marketing', noun: 'marketers', base: 85_000, variable: 0.08, variableKind: 'bonus', equity: 0.4, managerIsIc: true, patterns: [w('marketing|brand (?:manager|strategist)|cmo|chief marketing officer|social media|community manager|events? (?:manager|coordinator)')] },
  { id: 'comms', label: 'Communications & Content', noun: 'communications and content professionals', base: 78_000, variable: 0.06, variableKind: 'bonus', equity: 0.3, patterns: [w('communications?|public relations|pr|content (?:writer|strategist|manager|creator|lead)|copywriter|technical writer|writer|editor|journalist|reporter|producer')] },
  { id: 'recruiting', label: 'Recruiting & Talent', noun: 'recruiters', base: 78_000, variable: 0.1, variableKind: 'bonus', equity: 0.4, patterns: [/\brecruit|\btalent (?:acquisition|partner|sourcer|lead)|\bta (?:partner|lead|specialist|manager)\b|\bsourcer\b|\bheadhunter\b/i] },
  { id: 'people', label: 'People & HR', noun: 'people and HR professionals', base: 82_000, variable: 0.08, variableKind: 'bonus', equity: 0.4, patterns: [w('human resources|hr|hrbp|people (?:ops|operations|partner|business partner|team|lead)|chief people officer|chro|compensation|benefits|total rewards|l&d|learning and development')] },
  { id: 'ib', label: 'Investment Banking', noun: 'investment bankers', base: 135_000, variable: 0.65, variableKind: 'bonus', equity: 0.1, banking: true, locationSensitivity: 0.5, patterns: [w('investment bank(?:ing|er)|m&a|mergers|capital markets|leveraged finance|ib analyst|ib associate')] },
  { id: 'investing', label: 'Investing (PE, VC, asset management)', noun: 'investment professionals', base: 150_000, variable: 0.7, variableKind: 'bonus', equity: 0.2, banking: true, locationSensitivity: 0.5, maxConfidence: 70, patterns: [w('private equity|venture capital|vc|venture (?:partner|associate|investor|fellow)|investor|portfolio manager|hedge fund|asset management|investment (?:associate|analyst|professional|manager|director)|general partner')] },
  { id: 'accounting', label: 'Accounting & Audit', noun: 'accountants', base: 82_000, variable: 0.08, variableKind: 'bonus', equity: 0.3, locationSensitivity: 0.7, patterns: [w('accountant|accounting|audit(?:or)?|cpa|tax|bookkeep(?:er|ing)|payroll|controller|accounts (?:payable|receivable)')] },
  { id: 'finance', label: 'Finance & FP&A', noun: 'finance professionals', base: 95_000, variable: 0.12, variableKind: 'bonus', equity: 0.5, banking: true, locationSensitivity: 0.7, patterns: [w('financial analyst|fp&a|finance|treasury|cfo|chief financial officer|financial (?:planning|manager|advisor|adviser)|wealth|banker|credit analyst|risk (?:analyst|manager)|actuar(?:y|ial)|underwriter')] },
  { id: 'consulting', label: 'Consulting & Strategy', noun: 'consultants', base: 110_000, variable: 0.12, variableKind: 'bonus', equity: 0.2, locationSensitivity: 0.5, patterns: [w('consultant|consulting|strategy|strategist|corporate development|corp dev|engagement manager|advisory')] },
  { id: 'legal', label: 'Legal', noun: 'attorneys', base: 165_000, variable: 0.15, variableKind: 'bonus', equity: 0.3, locationSensitivity: 0.6, patterns: [w('attorney|lawyer|counsel|legal|solicitor|barrister|patent agent|juris doctor')] },
  { id: 'paralegal', label: 'Paralegal', noun: 'paralegals', base: 60_000, variable: 0.05, variableKind: 'bonus', equity: 0.1, locationSensitivity: 0.7, patterns: [w('paralegal|legal assistant')] },
  { id: 'compliance', label: 'Compliance & Risk', noun: 'compliance professionals', base: 95_000, variable: 0.1, variableKind: 'bonus', equity: 0.3, locationSensitivity: 0.7, patterns: [w('compliance|regulatory|aml|kyc|governance|privacy (?:analyst|manager|counsel)')] },
  { id: 'ops', label: 'Operations & BizOps', noun: 'operations professionals', base: 95_000, variable: 0.1, variableKind: 'bonus', equity: 0.5, patterns: [w('operations|bizops|business operations|chief of staff|coo|chief operating officer|general manager|business analyst|revops|revenue operations')] },
  { id: 'supply_chain', label: 'Supply Chain & Logistics', noun: 'supply chain professionals', base: 80_000, variable: 0.08, variableKind: 'bonus', equity: 0.3, locationSensitivity: 0.7, patterns: [w('supply chain|logistics|procurement|purchasing|buyer|sourcing (?:manager|specialist)|warehouse|fulfil?lment|inventory|demand planner|merchandis(?:er|ing)')] },
  { id: 'physician', label: 'Physicians', noun: 'physicians', base: 255_000, variable: 0.08, variableKind: 'bonus', equity: 0, locationSensitivity: 0.4, maxConfidence: 70, patterns: [w('physician|doctor|surgeon|hospitalist|psychiatrist|anesthesiologist|radiologist|cardiologist|dermatologist|oncologist|pediatrician')] },
  { id: 'nursing', label: 'Nursing', noun: 'nurses', base: 90_000, variable: 0.03, variableKind: 'bonus', equity: 0, locationSensitivity: 0.8, patterns: [w('nurse|rn|lpn|crna|nursing|nurse practitioner')] },
  { id: 'healthcare', label: 'Healthcare (allied)', noun: 'healthcare professionals', base: 88_000, variable: 0.03, variableKind: 'bonus', equity: 0, locationSensitivity: 0.6, patterns: [w('pharmacist|pharmacy|therapist|physiotherapist|clinical|medical|healthcare|dietitian|technologist|paramedic|dentist|dental|veterinar(?:ian|y)|optometrist|psychologist|counselor')] },
  { id: 'academia', label: 'Academia & Research', noun: 'academics and researchers', base: 92_000, variable: 0.02, variableKind: 'bonus', equity: 0, locationSensitivity: 0.5, patterns: [w('professor|lecturer|post-?doc(?:toral)?|research (?:fellow|associate|assistant)|faculty|dean|researcher')] },
  { id: 'research', label: 'Research Science', noun: 'research scientists', base: 135_000, variable: 0.1, variableKind: 'bonus', equity: 0.9, tech: true, patterns: [w('research scientist|scientist|chemist|physicist|biologist|bioinformatic(?:s|ian)')] },
  { id: 'education', label: 'Education', noun: 'educators', base: 62_000, variable: 0.02, variableKind: 'bonus', equity: 0, locationSensitivity: 0.6, patterns: [w('teacher|educator|instructor|tutor|teaching|curriculum|school (?:counselor|administrator)')] },
  { id: 'student', label: 'Students', noun: 'students', base: 38_000, variable: 0, variableKind: 'bonus', equity: 0, maxConfidence: 55, patterns: [w('student|phd candidate|undergrad(?:uate)?|graduate (?:student|researcher|assistant)|teaching assistant')] },
  { id: 'admin', label: 'Administrative', noun: 'administrative professionals', base: 62_000, variable: 0.04, variableKind: 'bonus', equity: 0.1, patterns: [w('executive assistant|administrative|admin(?:istrative)? assistant|office (?:manager|coordinator|administrator)|receptionist|personal assistant|secretary|virtual assistant')] },
  { id: 'real_estate', label: 'Real Estate', noun: 'real estate professionals', base: 70_000, variable: 0.4, variableKind: 'commission', equity: 0, maxConfidence: 65, patterns: [w('real estate|realtor|property manager|broker|leasing')] },
  { id: 'founder', label: 'Founders & Owners', noun: 'founders', base: 150_000, variable: 0.05, variableKind: 'bonus', equity: 2.0, maxConfidence: 40, patterns: [w('ceo|chief executive(?: officer)?|owner|(?<!vice[ -])president|managing partner|entrepreneur')] },
];

/** Checked before everything else: "Co-founder & CTO" is priced as a founder. */
export const FOUNDER_PATTERN = /\b(?:co-?founder|founder|founding (?:ceo|partner))\b/i;

// Generic fallbacks, tried only when nothing specific matched. Matches here lower confidence.
export const WEAK_FAMILIES: RoleFamily[] = [
  { ...ROLE_FAMILIES.find((f) => f.id === 'swe')!, patterns: [w('engineer(?:ing)?|technical lead|tech lead|architect')] },
  { ...ROLE_FAMILIES.find((f) => f.id === 'design')!, patterns: [w('designer|design')] },
  { ...ROLE_FAMILIES.find((f) => f.id === 'ops')!, patterns: [w('analyst|manager|director|head of|lead|vice president|vp|executive')] },
];

export const GENERAL_FAMILY: RoleFamily = {
  id: 'general',
  label: 'General professional',
  noun: 'professionals',
  base: 72_000,
  variable: 0.06,
  variableKind: 'bonus',
  equity: 0.4,
  maxConfidence: 50,
  patterns: [],
};

export interface Level {
  code: number;
  id: string;
  label: string;
  /** Base-salary multiplier relative to mid level. */
  mult: number;
  /** Typical years of experience at this level. */
  years: number;
  /** Equity multiplier relative to senior. */
  equity: number;
}

export const LEVELS: Level[] = [
  { code: 0, id: 'intern', label: 'Intern', mult: 0.55, years: 0, equity: 0 },
  { code: 1, id: 'entry', label: 'Entry level', mult: 0.8, years: 1, equity: 0.3 },
  { code: 2, id: 'mid', label: 'Mid level', mult: 1.0, years: 3, equity: 0.6 },
  { code: 3, id: 'senior', label: 'Senior', mult: 1.25, years: 6, equity: 1.0 },
  { code: 4, id: 'staff', label: 'Staff / Lead / Manager', mult: 1.52, years: 9, equity: 1.5 },
  { code: 5, id: 'principal', label: 'Principal / Senior Manager', mult: 1.8, years: 12, equity: 2.0 },
  { code: 6, id: 'director', label: 'Director', mult: 2.05, years: 14, equity: 2.4 },
  { code: 7, id: 'senior_director', label: 'Senior Director / Head of', mult: 2.35, years: 16, equity: 2.8 },
  { code: 8, id: 'vp', label: 'Vice President', mult: 2.75, years: 18, equity: 3.4 },
  { code: 9, id: 'cxo', label: 'C-suite', mult: 3.2, years: 20, equity: 4.0 },
];

export type TierId =
  | 'big_tech'
  | 'top_finance'
  | 'elite_consulting'
  | 'high_growth'
  | 'bank'
  | 'enterprise'
  | 'standard'
  | 'startup'
  | 'agency'
  | 'public_sector'
  | 'freelance';

export interface Tier {
  id: TierId;
  label: string;
  baseMult: number;
  variableMult: number;
  /** Annual equity as a share of base for a senior employee (scaled by level and family). */
  equityBase: number;
  equityLabel: string;
}

export const TIERS: Record<TierId, Tier> = {
  big_tech: { id: 'big_tech', label: 'Big Tech', baseMult: 1.12, variableMult: 1.4, equityBase: 0.55, equityLabel: 'Stock (RSUs)' },
  top_finance: { id: 'top_finance', label: 'Top-tier trading firm', baseMult: 1.3, variableMult: 2.5, equityBase: 0, equityLabel: 'Equity' },
  elite_consulting: { id: 'elite_consulting', label: 'Top-tier consulting', baseMult: 1.35, variableMult: 1.6, equityBase: 0, equityLabel: 'Equity' },
  high_growth: { id: 'high_growth', label: 'High-growth / late-stage', baseMult: 1.06, variableMult: 0.8, equityBase: 0.35, equityLabel: 'Private stock (paper value)' },
  bank: { id: 'bank', label: 'Major bank / financial firm', baseMult: 1.0, variableMult: 1.0, equityBase: 0.03, equityLabel: 'Deferred stock' },
  enterprise: { id: 'enterprise', label: 'Established enterprise', baseMult: 1.03, variableMult: 1.15, equityBase: 0.1, equityLabel: 'Stock (RSUs)' },
  standard: { id: 'standard', label: 'Typical company', baseMult: 1.0, variableMult: 1.0, equityBase: 0.05, equityLabel: 'Equity' },
  startup: { id: 'startup', label: 'Early-stage startup', baseMult: 0.92, variableMult: 0.4, equityBase: 0.28, equityLabel: 'Options (paper value)' },
  agency: { id: 'agency', label: 'Agency / IT services / Big Four', baseMult: 0.95, variableMult: 0.9, equityBase: 0.01, equityLabel: 'Equity' },
  public_sector: { id: 'public_sector', label: 'Public sector, education or non-profit', baseMult: 0.84, variableMult: 0.3, equityBase: 0, equityLabel: 'Equity' },
  freelance: { id: 'freelance', label: 'Self-employed / freelance', baseMult: 0.9, variableMult: 0, equityBase: 0, equityLabel: 'Equity' },
};

// Curated company → tier map (lowercase, punctuation stripped). Unknown companies fall back to keyword rules.
const COMPANY_LIST: Record<Exclude<TierId, 'standard' | 'freelance'>, string[]> = {
  big_tech: [
    'google', 'alphabet', 'google deepmind', 'deepmind', 'youtube', 'waymo', 'meta', 'facebook', 'instagram', 'whatsapp', 'apple',
    'amazon', 'aws', 'amazon web services', 'microsoft', 'netflix', 'nvidia', 'linkedin', 'uber', 'airbnb', 'stripe', 'openai',
    'anthropic', 'databricks', 'snowflake', 'coinbase', 'pinterest', 'doordash', 'roblox', 'lyft', 'snap', 'snapchat', 'dropbox',
    'palantir', 'adobe', 'salesforce', 'servicenow', 'intuit', 'block', 'square', 'robinhood', 'reddit', 'tiktok', 'bytedance',
    'shopify', 'atlassian', 'datadog', 'cloudflare', 'mongodb', 'twilio', 'okta', 'spotify', 'instacart', 'figma', 'x', 'twitter',
    'xai', 'scale ai', 'plaid', 'confluent', 'crowdstrike', 'zscaler', 'palo alto networks', 'workday', 'nutanix', 'unity',
  ],
  top_finance: [
    'jane street', 'citadel', 'citadel securities', 'two sigma', 'hudson river trading', 'hrt', 'de shaw', 'd e shaw',
    'jump trading', 'optiver', 'imc', 'imc trading', 'sig', 'susquehanna', 'susquehanna international group', 'millennium',
    'millennium management', 'point72', 'bridgewater', 'bridgewater associates', 'renaissance technologies', 'tower research',
    'tower research capital', 'five rings', 'drw', 'virtu', 'akuna capital', 'radix trading', 'xtx markets', 'old mission',
  ],
  elite_consulting: ['mckinsey', 'mckinsey company', 'boston consulting group', 'bcg', 'bain', 'bain company'],
  high_growth: [
    'notion', 'ramp', 'brex', 'rippling', 'deel', 'canva', 'revolut', 'monzo', 'wise', 'klarna', 'chime', 'gusto', 'airtable',
    'vercel', 'retool', 'anduril', 'spacex', 'discord', 'perplexity', 'mistral', 'mistral ai', 'cohere', 'hugging face',
    'glean', 'harvey', 'anysphere', 'cursor', 'linear', 'mercury', 'faire', 'flexport', 'grammarly', 'miro', 'celonis', 'n26',
    'checkout com', 'nubank', 'razorpay', 'cred', 'zepto', 'meesho', 'grab', 'sea', 'shopee', 'samsara', 'duolingo', 'toast',
    'rivian', 'nuro', 'cruise', 'zoox', 'aurora', 'replit', 'supabase', 'posthog', 'temporal', 'cockroach labs', 'dbt labs',
    'elevenlabs', 'runway', 'character ai', 'safe superintelligence', 'thinking machines lab', 'sierra', 'decagon', 'wiz',
  ],
  bank: [
    'goldman sachs', 'jpmorgan', 'jp morgan', 'jpmorgan chase', 'jpmorgan chase co', 'j p morgan', 'chase', 'morgan stanley',
    'bank of america', 'citi', 'citigroup', 'citibank', 'wells fargo', 'barclays', 'ubs', 'credit suisse', 'deutsche bank',
    'hsbc', 'bnp paribas', 'evercore', 'lazard', 'centerview partners', 'moelis', 'pjt partners', 'rothschild', 'jefferies',
    'blackrock', 'blackstone', 'kkr', 'carlyle', 'apollo global management', 'tpg', 'bain capital', 'warburg pincus',
    'fidelity', 'fidelity investments', 'vanguard', 'state street', 'capital one', 'american express', 'visa', 'mastercard',
    'nomura', 'mizuho', 'rbc', 'td', 'td bank', 'scotiabank', 'bmo', 'santander', 'societe generale', 'macquarie',
  ],
  enterprise: [
    'ibm', 'oracle', 'cisco', 'intel', 'dell', 'dell technologies', 'hp', 'hpe', 'hewlett packard enterprise', 'sap', 'vmware',
    'broadcom', 'qualcomm', 'amd', 'micron', 'texas instruments', 'tesla', 'boeing', 'lockheed martin', 'raytheon', 'rtx',
    'northrop grumman', 'general electric', 'ge', 'ge healthcare', 'siemens', 'honeywell', '3m', 'johnson johnson', 'pfizer',
    'merck', 'procter gamble', 'p g', 'unilever', 'nestle', 'pepsico', 'coca cola', 'walmart', 'target', 'costco', 'home depot',
    'nike', 'disney', 'the walt disney company', 'comcast', 'verizon', 'at t', 't mobile', 'ford', 'general motors', 'gm',
    'toyota', 'bmw', 'mercedes benz', 'volkswagen', 'exxonmobil', 'chevron', 'shell', 'bp', 'ups', 'fedex', 'paypal',
    'autodesk', 'red hat', 'samsung', 'sony', 'lg', 'huawei', 'alibaba', 'tencent', 'baidu', 'hubspot', 'zoom', 'docusign',
    'ebay', 'expedia', 'booking com', 'electronic arts', 'activision blizzard', 'epic games', 'arm', 'asml', 'applied materials',
    'lam research', 'kla', 'synopsys', 'cadence', 'thomson reuters', 'bloomberg', 'mckesson', 'unitedhealth group',
    'cvs health', 'elevance health', 'abbvie', 'eli lilly', 'amgen', 'gilead', 'novartis', 'roche', 'astrazeneca', 'gsk',
    'sanofi', 'medtronic', 'abbott', 'stryker', 'philips', 'airbus', 'rolls royce', 'caterpillar', 'deere', 'john deere',
  ],
  startup: [],
  agency: [
    'deloitte', 'pwc', 'pricewaterhousecoopers', 'ey', 'ernst young', 'kpmg', 'accenture', 'capgemini', 'cognizant',
    'infosys', 'tcs', 'tata consultancy services', 'wipro', 'hcl', 'hcltech', 'tech mahindra', 'ibm consulting',
    'booz allen hamilton', 'slalom', 'thoughtworks', 'epam', 'globant', 'publicis', 'publicis sapient', 'wpp', 'omnicom',
    'ogilvy', 'dentsu', 'havas', 'ltimindtree', 'genpact', 'ntt data', 'dxc technology', 'kforce', 'robert half',
  ],
  public_sector: ['nasa', 'nih', 'cdc', 'united nations', 'unicef', 'world bank', 'red cross', 'peace corps', 'nhs'],
};

export const COMPANY_TIERS: Map<string, TierId> = new Map(
  Object.entries(COMPANY_LIST).flatMap(([tier, names]) => names.map((n) => [n, tier as TierId] as const)),
);

export const COMPANY_KEYWORDS: Array<{ pattern: RegExp; tier: TierId }> = [
  { pattern: /\b(stealth|stealth startup|stealth mode|y combinator|yc [ws]\d{2}|\(yc)/i, tier: 'startup' },
  { pattern: /\b(self[- ]employed|freelance|freelancer|independent|contractor)\b/i, tier: 'freelance' },
  { pattern: /\b(university|college|school|academy|institute of|public schools|school district)\b/i, tier: 'public_sector' },
  { pattern: /\b(government|department of|ministry|city of|county|state of|federal|army|navy|air force|marine corps|national guard|council|municipal)\b/i, tier: 'public_sector' },
  { pattern: /\b(foundation|non-?profit|ngo|charity|association)\b/i, tier: 'public_sector' },
  { pattern: /\b(hospital|health system|medical center|clinic)\b/i, tier: 'public_sector' },
  { pattern: /\b(bank|capital|securities|asset management|investments|partners llp)\b/i, tier: 'bank' },
  { pattern: /\b(consulting|consultancy|agency|studio|solutions pvt|technologies pvt)\b/i, tier: 'agency' },
  { pattern: /\b(labs|\.ai|ai inc)\b/i, tier: 'startup' },
];

export interface Market {
  id: string;
  label: string;
  country: string;
  currency: string;
  /** Pay multiplier vs. US national, before currency conversion. */
  mult: number;
  keywords: string[];
  /** true for metro-level matches (more precise than a country). */
  metro: boolean;
  /**
   * How much more global employers (Big Tech, top finance, late-stage startups) pay than a typical
   * local employer in this market. 1 in high-income markets; well above 1 where the gap is large.
   */
  premium: number;
}

const PREMIUM: Record<string, number> = {
  IN: 1.6, PK: 1.5, BD: 1.5, PH: 1.5, VN: 1.5, ID: 1.4, NG: 1.6, KE: 1.5, EG: 1.5, MY: 1.3, TH: 1.3, BR: 1.3,
  MX: 1.3, AR: 1.3, CO: 1.3, CL: 1.2, TR: 1.3, UA: 1.25, RO: 1.25, PL: 1.2, CZ: 1.2, HU: 1.2, ZA: 1.2, CN: 1.15,
};
const m = (id: string, label: string, country: string, currency: string, mult: number, keywords: string[], metro = true): Market => ({
  id, label, country, currency, mult, keywords, metro, premium: PREMIUM[country] ?? 1,
});

// Metro entries come before their country entries; longest keyword wins inside the matcher.
export const MARKETS: Market[] = [
  // United States
  m('us-sf', 'San Francisco Bay Area', 'US', 'USD', 1.22, ['san francisco', 'bay area', 'san jose', 'palo alto', 'mountain view', 'menlo park', 'sunnyvale', 'cupertino', 'oakland', 'santa clara', 'redwood city', 'san mateo', 'berkeley', 'fremont', 'silicon valley']),
  m('us-nyc', 'New York City', 'US', 'USD', 1.18, ['new york city', 'new york, ny', 'new york, new york', 'nyc', 'manhattan', 'brooklyn', 'queens', 'jersey city', 'hoboken', 'greater new york']),
  m('us-sea', 'Seattle', 'US', 'USD', 1.15, ['seattle', 'redmond', 'bellevue', 'kirkland']),
  m('us-bos', 'Boston', 'US', 'USD', 1.1, ['boston', 'cambridge, massachusetts', 'cambridge, ma', 'somerville']),
  m('us-la', 'Los Angeles', 'US', 'USD', 1.08, ['los angeles', 'santa monica', 'culver city', 'pasadena', 'irvine', 'orange county', 'long beach']),
  m('us-sd', 'San Diego', 'US', 'USD', 1.06, ['san diego']),
  m('us-dc', 'Washington, DC', 'US', 'USD', 1.08, ['washington, dc', 'washington dc', 'washington, district of columbia', 'district of columbia', 'arlington, virginia', 'reston', 'mclean', 'bethesda', 'dc-baltimore']),
  m('us-aus', 'Austin', 'US', 'USD', 1.03, ['austin']),
  m('us-den', 'Denver', 'US', 'USD', 1.02, ['denver', 'boulder']),
  m('us-chi', 'Chicago', 'US', 'USD', 1.02, ['chicago']),
  m('us-pdx', 'Portland', 'US', 'USD', 1.0, ['portland, oregon', 'portland, or']),
  m('us-phl', 'Philadelphia', 'US', 'USD', 1.0, ['philadelphia']),
  m('us-atl', 'Atlanta', 'US', 'USD', 0.98, ['atlanta']),
  m('us-dfw', 'Dallas–Fort Worth', 'US', 'USD', 0.98, ['dallas', 'fort worth', 'plano', 'irving']),
  m('us-hou', 'Houston', 'US', 'USD', 0.97, ['houston']),
  m('us-mia', 'Miami', 'US', 'USD', 0.98, ['miami', 'fort lauderdale']),
  m('us-msp', 'Minneapolis', 'US', 'USD', 0.98, ['minneapolis', 'st paul', 'saint paul']),
  m('us-rdu', 'Raleigh–Durham', 'US', 'USD', 0.97, ['raleigh', 'durham', 'research triangle']),
  m('us-clt', 'Charlotte', 'US', 'USD', 0.97, ['charlotte']),
  m('us-slc', 'Salt Lake City', 'US', 'USD', 0.96, ['salt lake city', 'lehi', 'provo']),
  m('us-phx', 'Phoenix', 'US', 'USD', 0.95, ['phoenix', 'scottsdale', 'tempe', 'chandler']),
  m('us-bna', 'Nashville', 'US', 'USD', 0.95, ['nashville']),
  m('us-pit', 'Pittsburgh', 'US', 'USD', 0.93, ['pittsburgh']),
  m('us-det', 'Detroit', 'US', 'USD', 0.93, ['detroit', 'ann arbor']),
  m('us-cmh', 'Columbus', 'US', 'USD', 0.92, ['columbus, ohio', 'columbus, oh']),
  m('us-stl', 'St. Louis', 'US', 'USD', 0.9, ['st. louis', 'st louis', 'saint louis']),
  m('us-kc', 'Kansas City', 'US', 'USD', 0.9, ['kansas city']),
  m('us-remote', 'United States (remote)', 'US', 'USD', 1.0, ['remote, us', 'remote (us)', 'united states (remote)', 'us remote', 'remote - us']),
  m('us', 'United States', 'US', 'USD', 0.95, ['united states', 'usa', 'u.s.', 'america', ', us', 'california', 'texas', 'florida', 'massachusetts', 'washington state', 'colorado', 'illinois', 'georgia', 'north carolina', 'virginia', 'new jersey', 'pennsylvania', 'ohio', 'michigan', 'arizona', 'oregon', 'utah', 'minnesota', 'tennessee', 'missouri', 'maryland', 'wisconsin', 'indiana', 'connecticut'], false),
  // Canada
  m('ca-yvr', 'Vancouver', 'CA', 'CAD', 0.72, ['vancouver']),
  m('ca-yyz', 'Toronto', 'CA', 'CAD', 0.72, ['toronto', 'waterloo', 'mississauga', 'gta']),
  m('ca-yul', 'Montreal', 'CA', 'CAD', 0.64, ['montreal', 'montréal']),
  m('ca', 'Canada', 'CA', 'CAD', 0.64, ['canada', 'ontario', 'quebec', 'british columbia', 'alberta', 'calgary', 'ottawa'], false),
  // Europe
  m('gb-lon', 'London', 'GB', 'GBP', 0.66, ['london']),
  m('gb', 'United Kingdom', 'GB', 'GBP', 0.54, ['united kingdom', 'england', 'scotland', 'wales', 'northern ireland', 'uk', 'manchester', 'edinburgh', 'cambridge, england', 'oxford', 'bristol'], false),
  m('ie', 'Ireland', 'IE', 'EUR', 0.64, ['ireland', 'dublin', 'cork'], false),
  m('ch', 'Switzerland', 'CH', 'CHF', 1.02, ['switzerland', 'zurich', 'zürich', 'geneva', 'genève', 'basel', 'lausanne'], false),
  m('de-muc', 'Munich', 'DE', 'EUR', 0.64, ['munich', 'münchen']),
  m('de-ber', 'Berlin', 'DE', 'EUR', 0.6, ['berlin']),
  m('de', 'Germany', 'DE', 'EUR', 0.58, ['germany', 'deutschland', 'hamburg', 'frankfurt', 'cologne', 'köln', 'stuttgart', 'düsseldorf'], false),
  m('nl', 'Netherlands', 'NL', 'EUR', 0.6, ['netherlands', 'amsterdam', 'rotterdam', 'utrecht', 'the hague', 'eindhoven'], false),
  m('fr-par', 'Paris', 'FR', 'EUR', 0.55, ['paris', 'île-de-france', 'ile-de-france']),
  m('fr', 'France', 'FR', 'EUR', 0.47, ['france', 'lyon', 'toulouse', 'marseille', 'lille', 'nantes'], false),
  m('se', 'Sweden', 'SE', 'SEK', 0.52, ['sweden', 'stockholm', 'gothenburg', 'malmö'], false),
  m('dk', 'Denmark', 'DK', 'DKK', 0.62, ['denmark', 'copenhagen'], false),
  m('no', 'Norway', 'NO', 'NOK', 0.6, ['norway', 'oslo'], false),
  m('fi', 'Finland', 'FI', 'EUR', 0.5, ['finland', 'helsinki'], false),
  m('be', 'Belgium', 'BE', 'EUR', 0.55, ['belgium', 'brussels', 'antwerp'], false),
  m('at', 'Austria', 'AT', 'EUR', 0.54, ['austria', 'vienna', 'wien'], false),
  m('es', 'Spain', 'ES', 'EUR', 0.4, ['spain', 'madrid', 'barcelona', 'valencia'], false),
  m('pt', 'Portugal', 'PT', 'EUR', 0.34, ['portugal', 'lisbon', 'lisboa', 'porto'], false),
  m('it', 'Italy', 'IT', 'EUR', 0.42, ['italy', 'milan', 'milano', 'rome', 'roma', 'turin'], false),
  m('pl', 'Poland', 'PL', 'PLN', 0.38, ['poland', 'warsaw', 'kraków', 'krakow', 'wrocław', 'wroclaw', 'gdańsk'], false),
  m('cz', 'Czechia', 'CZ', 'CZK', 0.36, ['czech', 'czechia', 'prague', 'brno'], false),
  m('ro', 'Romania', 'RO', 'RON', 0.32, ['romania', 'bucharest', 'cluj'], false),
  m('hu', 'Hungary', 'HU', 'HUF', 0.3, ['hungary', 'budapest'], false),
  m('gr', 'Greece', 'GR', 'EUR', 0.3, ['greece', 'athens'], false),
  m('ua', 'Ukraine', 'UA', 'UAH', 0.3, ['ukraine', 'kyiv', 'kiev', 'lviv'], false),
  m('tr', 'Türkiye', 'TR', 'TRY', 0.22, ['turkey', 'türkiye', 'istanbul', 'ankara'], false),
  // Middle East & Africa
  m('il', 'Israel', 'IL', 'ILS', 0.7, ['israel', 'tel aviv', 'herzliya', 'haifa', 'jerusalem'], false),
  m('ae', 'United Arab Emirates', 'AE', 'AED', 0.72, ['united arab emirates', 'uae', 'dubai', 'abu dhabi'], false),
  m('sa', 'Saudi Arabia', 'SA', 'SAR', 0.62, ['saudi arabia', 'riyadh', 'jeddah'], false),
  m('za', 'South Africa', 'ZA', 'ZAR', 0.28, ['south africa', 'johannesburg', 'cape town'], false),
  m('ng', 'Nigeria', 'NG', 'NGN', 0.08, ['nigeria', 'lagos', 'abuja'], false),
  m('ke', 'Kenya', 'KE', 'KES', 0.1, ['kenya', 'nairobi'], false),
  m('eg', 'Egypt', 'EG', 'EGP', 0.08, ['egypt', 'cairo'], false),
  // Asia-Pacific
  m('sg', 'Singapore', 'SG', 'SGD', 0.76, ['singapore'], false),
  m('hk', 'Hong Kong', 'HK', 'HKD', 0.7, ['hong kong'], false),
  m('jp', 'Japan', 'JP', 'JPY', 0.5, ['japan', 'tokyo', 'osaka', 'kyoto'], false),
  m('kr', 'South Korea', 'KR', 'KRW', 0.48, ['south korea', 'korea', 'seoul'], false),
  m('tw', 'Taiwan', 'TW', 'TWD', 0.38, ['taiwan', 'taipei', 'hsinchu'], false),
  m('cn', 'China', 'CN', 'CNY', 0.42, ['china', 'shanghai', 'beijing', 'shenzhen', 'hangzhou', 'guangzhou'], false),
  m('au-syd', 'Sydney', 'AU', 'AUD', 0.72, ['sydney']),
  m('au', 'Australia', 'AU', 'AUD', 0.68, ['australia', 'melbourne', 'brisbane', 'perth', 'canberra', 'adelaide'], false),
  m('nz', 'New Zealand', 'NZ', 'NZD', 0.58, ['new zealand', 'auckland', 'wellington'], false),
  m('in-blr', 'Bengaluru', 'IN', 'INR', 0.17, ['bengaluru', 'bangalore']),
  m('in', 'India', 'IN', 'INR', 0.14, ['india', 'hyderabad', 'pune', 'mumbai', 'delhi', 'new delhi', 'gurgaon', 'gurugram', 'noida', 'chennai', 'kolkata', 'ahmedabad'], false),
  m('pk', 'Pakistan', 'PK', 'PKR', 0.07, ['pakistan', 'karachi', 'lahore', 'islamabad'], false),
  m('bd', 'Bangladesh', 'BD', 'BDT', 0.06, ['bangladesh', 'dhaka'], false),
  m('ph', 'Philippines', 'PH', 'PHP', 0.11, ['philippines', 'manila', 'makati', 'cebu'], false),
  m('vn', 'Vietnam', 'VN', 'VND', 0.12, ['vietnam', 'viet nam', 'ho chi minh', 'hanoi'], false),
  m('id', 'Indonesia', 'ID', 'IDR', 0.12, ['indonesia', 'jakarta', 'bandung'], false),
  m('my', 'Malaysia', 'MY', 'MYR', 0.22, ['malaysia', 'kuala lumpur'], false),
  m('th', 'Thailand', 'TH', 'THB', 0.2, ['thailand', 'bangkok'], false),
  // Latin America
  m('br', 'Brazil', 'BR', 'BRL', 0.24, ['brazil', 'brasil', 'são paulo', 'sao paulo', 'rio de janeiro', 'belo horizonte'], false),
  m('mx', 'Mexico', 'MX', 'MXN', 0.24, ['mexico', 'méxico', 'mexico city', 'ciudad de méxico', 'guadalajara', 'monterrey'], false),
  m('ar', 'Argentina', 'AR', 'ARS', 0.17, ['argentina', 'buenos aires'], false),
  m('co', 'Colombia', 'CO', 'COP', 0.2, ['colombia', 'bogotá', 'bogota', 'medellín', 'medellin'], false),
  m('cl', 'Chile', 'CL', 'CLP', 0.3, ['chile', 'santiago'], false),
];

export const US_NATIONAL: Market = m('us-national', 'United States (national)', 'US', 'USD', 1.0, [], false);

/** Approximate USD → local rates. Edit as rates move; estimates are generated in USD then converted. */
export const FX_AS_OF = '2026-10';
export const FX: Record<string, number> = {
  USD: 1, CAD: 1.38, GBP: 0.75, EUR: 0.86, CHF: 0.8, SEK: 9.5, DKK: 6.4, NOK: 10.1, PLN: 3.65, CZK: 21, RON: 4.35,
  HUF: 335, UAH: 41.5, TRY: 41, ILS: 3.35, AED: 3.67, SAR: 3.75, ZAR: 17.5, NGN: 1500, KES: 129, EGP: 48, SGD: 1.29,
  HKD: 7.8, JPY: 150, KRW: 1380, TWD: 30, CNY: 7.1, AUD: 1.53, NZD: 1.7, INR: 88, PKR: 280, BDT: 122, PHP: 57,
  VND: 26000, IDR: 16300, MYR: 4.2, THB: 32.5, BRL: 5.4, MXN: 18.5, ARS: 1400, COP: 3900, CLP: 950,
};
