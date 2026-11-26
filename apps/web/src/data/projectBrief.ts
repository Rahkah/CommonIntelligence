import {
  PROJECT_BRIEF_REQUIRED_FIELDS as requiredFields,
  PROJECT_BRIEF_VERSION,
  PROJECT_PROPOSAL_LIMITS as limits,
  validateProjectBrief,
  type Locale,
} from '@common-intelligence/shared';

export const PROJECT_IDEA_LIMIT = 6000;
export const PROJECT_BRIEF_LIMIT = 120000;

const fieldGuidance = {
  en: {
    name: 'Short, catchy playground or challenge name',
    domain: 'Vibe or tag (e.g. Multi-Agent Playground, Pixel Art, Game Arena)',
    summary: 'One punchy sentence explaining why this is fun',
    goal: 'How independent AIs participate and what makes it exciting to watch',
  },
  zh: {
    name: '简短好记的游乐场或挑战名称',
    domain: '标签（例如：多 Agent 游乐场、像素共创、博弈擂台）',
    summary: '一句话说清哪里好玩',
    goal: 'AI 们怎么一起玩、围观者能看到什么有趣画面',
  },
};

export function buildProjectBriefPrompt(idea: string, locale: Locale) {
  const template = {
    schemaVersion: PROJECT_BRIEF_VERSION,
    category: 'playground',
    ...Object.fromEntries(requiredFields.map((field) => [field, fieldGuidance[locale][field]])),
    githubRepo: null,
  };
  const instructions =
    locale === 'zh'
      ? [
          '把下面的点子整理成一个精简、好玩的 Common Intelligence 游乐场/挑战方案。',
          '只输出一个合法 JSON 对象，字段名与模板一致，语言简洁有吸引力，不要写冗长的学术套话。',
          'category 填 "playground" 或 "challenge"；githubRepo 无公开仓库时填 null。',
        ]
      : [
          'Turn the idea below into a crisp, fun Common Intelligence playground or challenge brief.',
          'Output one valid JSON object matching the template. Keep it concise and playful — no academic boilerplate.',
          'Set category to "playground" or "challenge", and githubRepo to null unless provided.',
        ];
  const sizeGuide = requiredFields.map((field) => `${field} <= ${limits[field]}`).join(', ');
  return [
    ...instructions,
    `${locale === 'zh' ? '字符上限' : 'Limits'}: ${sizeGuide}.`,
    '',
    JSON.stringify(template, null, 2),
    '',
    locale === 'zh' ? '原始点子' : 'Idea',
    JSON.stringify(idea.trim()),
  ].join('\n');
}

export function parseProjectBrief(raw: string): ReturnType<typeof validateProjectBrief> {
  if (raw.length > PROJECT_BRIEF_LIMIT) return { error: 'briefFormat' };
  const input = raw.trim();
  const fenced = /^```(?:json)?[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```$/i.exec(input);
  let value: unknown;
  try {
    value = JSON.parse(fenced?.[1] ?? input);
  } catch {
    return { error: 'briefFormat' };
  }
  return validateProjectBrief(value);
}
