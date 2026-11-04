import type { ChipColor } from "@/components/base/badges/chip";
import type { Level } from "./api";

export const LEVELS: Level[] = ["weak", "recheck", "unknown", "exposed", "assisted", "independent", "validated"];

export const LEVEL: Record<Level, { label: string; hint: string; color: ChipColor }> = {
  unknown: { label: "未知", hint: "没有足够证据，不知道是否掌握", color: "neutral" },
  exposed: { label: "接触过", hint: "学过或看过，还没有独立作答证据", color: "cyan" },
  assisted: { label: "有提示能做", hint: "有提示时能够完成", color: "yellow" },
  independent: { label: "独立完成", hint: "已在无提示情境下正确作答", color: "blue" },
  validated: { label: "已验证", hint: "有跨时间、跨题型或陌生变式的支持证据", color: "lime" },
  weak: { label: "薄弱", hint: "当前存在明确的知识或技能缺口", color: "rose" },
  recheck: { label: "待复查", hint: "旧证据不足以支持当前判断，需要重新检验", color: "orange" },
};

export const KIND: Record<string, string> = {
  concept: "概念",
  definition: "定义",
  theorem: "定理",
  formula: "公式",
  method: "方法",
  problem_type: "题型",
};

export const RELATION: Record<string, { out: string; in: string }> = {
  prerequisite_of: { out: "后续知识", in: "前置知识" },
  part_of: { out: "属于", in: "包含" },
  confused_with: { out: "容易混淆", in: "容易混淆" },
  contrasts_with: { out: "对比", in: "对比" },
  analogous_to: { out: "跨学科类比", in: "跨学科类比" },
};

export const WEIGHT: Record<number, string> = { 3: "必需", 2: "重要", 1: "辅助" };

export const LAYER_LABEL: Record<string, string> = {
  use: "用法层",
  mechanism: "机制层",
  principle: "原理层",
  boundary: "边界层",
};

export const ACTION: Record<string, { label: string; color: ChipColor }> = {
  diagnose: { label: "诊断", color: "purple" },
  explain: { label: "讲解", color: "blue" },
  practice: { label: "练习", color: "cyan" },
  retest: { label: "复测", color: "orange" },
  advance: { label: "推进", color: "lime" },
  learn: { label: "要学", color: "lime" },
  skim: { label: "略读", color: "yellow" },
  skip: { label: "跳过", color: "neutral" },
};

export const DECISION_STATUS: Record<string, string> = {
  planned: "待执行",
  active: "生效中",
  done: "已完成",
  revoked: "已撤销",
};

export const COURSE_STATUS: Record<string, string> = { active: "进行中", paused: "暂停", done: "已结束" };
export const ASSESSMENT_STATUS: Record<string, string> = { upcoming: "未考", done: "已考", dropped: "放弃" };

export const VALUE_LABEL: Record<number, string> = { 0: "不考", 1: "低", 2: "中", 3: "高" };
export const UNCERTAINTY: Record<string, string> = { low: "把握大", medium: "把握一般", high: "不确定" };

export const EVIDENCE_KIND: Record<string, string> = {
  step: "作答步骤",
  exposure: "接触材料",
  prediction: "随堂检查",
  self_explain: "自己解释",
  self_report: "主观自评",
};
export const OUTCOME: Record<string, { label: string; color: ChipColor }> = {
  demonstrated: { label: "做对", color: "lime" },
  failed: { label: "出错", color: "rose" },
  not_reached: { label: "没做到", color: "neutral" },
  unclear: { label: "不明确", color: "neutral" },
};
export const REPRESENTATION: Record<string, string> = {
  verbal: "口头讲解",
  worked_example: "完整例题",
  faded_example: "渐隐例题",
  counterexample: "反例",
  graph: "图像",
  numeric: "数值",
  formal: "形式推导",
  analogy: "类比",
  hands_on: "动手操作",
};
export const QUALIFIER: Record<string, string> = { guessed: "猜的", slip: "手误", lucky_path: "碰巧对" };
export const CONTEXT: Record<string, string> = {
  right_after_teaching: "刚讲完",
  delayed: "延迟",
  mixed: "混合",
  timed: "限时",
  unseen_variant: "陌生变式",
};
export const HINTS: Record<string, string> = { none: "无提示", partial: "部分提示", full: "完整提示" };
export const SELF_SIGNAL: Record<string, string> = { sure: "自己说有把握", unsure: "自己说不确定", guessed: "自己说是猜的" };
export const DIFFICULTY: Record<string, string> = {
  unknown_concept: "不认识概念",
  condition: "不理解条件",
  recognition: "不会识别题型",
  execution: "不会计算",
  transfer: "不会变式",
  forgetting: "延迟遗忘",
};
export const TASK_SOURCE: Record<string, string> = {
  past_paper: "真题",
  textbook: "教材",
  homework: "作业",
  teacher_sample: "老师样题",
  ai_generated: "AI 出题",
};
export const ASSESSED_BY: Record<string, string> = { rule: "规则", ai: "AI", self: "自己" };

/** D1 stores UTC "YYYY-MM-DD HH:MM:SS"; show it in local time. */
export function fmtTime(s: string | null | undefined, withTime = true): string {
  if (!s) return "—";
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
