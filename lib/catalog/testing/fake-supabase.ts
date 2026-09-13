// Minimal chainable stand-in for the supabase-js query builder used by lib/catalog/supabase.ts.
export type FakeResult = { data: unknown; error: { message: string } | null };
export type FakeCall = [method: string, args: unknown[]];
export type FakeResolver = (table: string, calls: FakeCall[]) => FakeResult;

export class FakeQuery implements PromiseLike<FakeResult> {
  readonly calls: FakeCall[] = [];
  constructor(private readonly table: string, private readonly resolver: FakeResolver) {}
  private record(method: string, args: unknown[]): this {
    this.calls.push([method, args]);
    return this;
  }
  select(...args: unknown[]): this { return this.record("select", args); }
  in(...args: unknown[]): this { return this.record("in", args); }
  eq(...args: unknown[]): this { return this.record("eq", args); }
  order(...args: unknown[]): this { return this.record("order", args); }
  range(...args: unknown[]): this { return this.record("range", args); }
  maybeSingle(...args: unknown[]): this { return this.record("maybeSingle", args); }
  then<R1 = FakeResult, R2 = never>(
    onfulfilled?: ((value: FakeResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.resolver(this.table, this.calls)).then(onfulfilled, onrejected);
  }
}

export class FakeSupabase {
  readonly queries: FakeQuery[] = [];
  constructor(private readonly resolver: FakeResolver) {}
  from(table: string): FakeQuery {
    const query = new FakeQuery(table, this.resolver);
    this.queries.push(query);
    return query;
  }
}
