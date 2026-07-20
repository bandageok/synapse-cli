// src/soul/FakeExecutionWatchdog.ts
// Detects assistant execution claims that are not accompanied by a tool call.

export interface TurnRecord {
  turnNumber: number;
  hasToolCall: boolean;
  hasExecutionIntent: boolean; // 文字中包含"正在做""马上改""已修改"等
  content: string;
}

export class FakeExecutionWatchdog {
  private turns: TurnRecord[] = [];

  // 执行意图关键词
  private readonly intentPatterns = [
    /正在(做|修改|执行|处理|运行|创建|删除|更新)/,
    /马上(改|做|执行|处理)/,
    /已(修改|创建|删除|更新|执行|完成)/,
    /我来(做|改|处理|执行|创建|修改|删除|更新)/,
    /让我(来)?(做|改|处理|执行)/,
    /now (doing|running|creating|editing|modifying)/i,
    /i('m| am) (going to|about to)/i,
    /let me (do|fix|edit|create|run)/i,
  ];

  // 记录一轮对话
  recordTurn(turnNumber: number, content: string, hasToolCall: boolean): void {
    const hasExecutionIntent = this.detectExecutionIntent(content);
    this.turns.push({ turnNumber, hasToolCall, hasExecutionIntent, content });
  }

  // 检测假执行
  check(): { violations: TurnRecord[]; clean: boolean } {
    const violations = this.turns.filter(
      t => t.hasExecutionIntent && !t.hasToolCall
    );
    return { violations, clean: violations.length === 0 };
  }

  // 生成报告
  report(): string {
    const { violations, clean } = this.check();
    if (clean) return '';

    const lines = violations.map(v =>
      `  Turn ${v.turnNumber}: "${v.content.slice(0, 80)}..." (no tool call)`
    );
    return `⚠️ Fake execution detected:\n${lines.join('\n')}`;
  }

  // 重置（新会话时）
  reset(): void {
    this.turns = [];
  }

  private detectExecutionIntent(content: string): boolean {
    return this.intentPatterns.some(p => p.test(content));
  }
}
