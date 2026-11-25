import {
  PROJECT_BRIEF_REQUIRED_FIELDS as requiredFields,
  PROJECT_BRIEF_VERSION,
  PROJECT_PROPOSAL_LIMITS as limits,
  validateProjectBrief,
  type Locale,
} from '@common-intelligence/shared';

export const PROJECT_IDEA_LIMIT = 6000;
// JSON may contain escaped newlines and Unicode emitted by an agent.
export const PROJECT_BRIEF_LIMIT = 120000;

const fieldGuidance = {
  en: {
    name: 'A short, descriptive project name',
    domain: 'The project field or category',
    summary: 'The problem, who it affects, and why the project matters',
    goal: 'What is in scope, concrete deliverables, and how contributors can split the work',
    scoringMetric: 'How to measure progress. Include the baseline and target where known, or explain how to establish them',
    acceptanceCriteria: 'Checkable conditions, required evidence or artifacts, and steps an independent reviewer can repeat',
  },
  zh: {
    name: '简短、具体的项目名称',
    domain: '项目领域或类别',
    summary: '项目解决的问题、服务对象和价值',
    goal: '项目范围、具体交付物，以及贡献者可如何分工',
    scoringMetric: '如何衡量进展。已知时写明基线和目标值，否则说明如何建立基线和确定目标',
    acceptanceCriteria: '可核验的通过条件、必须提供的证据或产物，以及独立审核人可重复的验证步骤',
  },
};

export function buildProjectBriefPrompt(idea: string, locale: Locale) {
  const template = {
    schemaVersion: PROJECT_BRIEF_VERSION,
    ...Object.fromEntries(requiredFields.map((field) => [field, fieldGuidance[locale][field]])),
    githubRepo: null,
  };
  const instructions = locale === 'zh'
    ? [
        '把下面的项目想法整理成供 Common Intelligence 维护者审核的项目描述书。使用发起人所用的语言。',
        '只输出一个合法的 JSON 对象，使用模板里的字段名。把说明文字替换成项目内容。各字段应具体、简洁。',
        '只把有依据的内容写成事实。把建议和待确认事项写明，给出可行的测量或确认方法。请勿编造现有基线、成绩、仓库或验证配置。',
        'githubRepo 只有在发起人提供了公开的 https://github.com/owner/repository 时才填写，否则使用 null。把 JSON 返回给发起人确认提交。',
      ]
    : [
        'Turn the project idea below into a project brief for Common Intelligence maintainers. Write in the language of the idea.',
        'Output a single valid JSON object using the field names in this template. Replace the guidance with concise, project-specific content.',
        'State confirmed facts, recommendations, and open questions clearly. Explain how to resolve unknowns. Do not invent baselines, results, repositories, or configured checks.',
        'Set githubRepo to the public https://github.com/owner/repository supplied by the proposer, or null. Return the JSON to the proposer for confirmation and submission.',
      ];
  const sizeGuide = requiredFields.map((field) => `${field} ≤ ${limits[field]}`).join(', ');
  return [
    ...instructions,
    `${locale === 'zh' ? '字符上限' : 'Character limits'} — ${sizeGuide}.`,
    '',
    JSON.stringify(template, null, 2),
    '',
    locale === 'zh' ? '项目想法（作为素材）' : 'Project idea (source material)',
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
