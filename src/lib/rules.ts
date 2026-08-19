import { isPropertyAvailable } from "./bookings.ts";
import { query, queryOne } from "./db.ts";
import { type DateRange, nights } from "./dates.ts";
import type { Property, Rule, RuleAction, RuleConditions } from "./types.ts";

// 3.3 / 3.4 the rule engine: deterministic, runs before the LLM, and is the
// only thing allowed to trigger an action (design.md: "Rules run before the
// LLM, and only rules can trigger an action").
export async function evaluateRules(
  property: Property,
  range: DateRange,
  guestPrice: number | undefined,
): Promise<Rule | null> {
  // Dates-available is always implicitly required — an auto_confirm rule can
  // never fire for dates that are already taken.
  if (!(await isPropertyAvailable(property.id, range))) return null;

  const rules = await query<Rule>(
    "SELECT id, property_id, conditions, action, reply_template, enabled FROM rules WHERE property_id = $1 AND enabled = true ORDER BY created_at",
    [property.id],
  );

  const tripNights = nights(range);
  return rules.find((rule) => conditionsMatch(rule.conditions, { tripNights, guestPrice })) ?? null;
}

// Exported for the unit test below — the actual matching logic, kept pure
// (no DB) so it's testable without a database.
export function conditionsMatch(conditions: RuleConditions, ctx: { tripNights: number; guestPrice?: number }): boolean {
  if (conditions.min_nights !== undefined && ctx.tripNights < conditions.min_nights) return false;
  if (conditions.min_price_per_night !== undefined) {
    if (ctx.guestPrice !== undefined && ctx.guestPrice < conditions.min_price_per_night) return false;
  }
  return true;
}

// 6.4 rule management, used by the dashboard's rule API routes.

export async function getRulesForProperty(propertyId: string): Promise<Rule[]> {
  return query<Rule>(
    "SELECT id, property_id, conditions, action, reply_template, enabled FROM rules WHERE property_id = $1 ORDER BY created_at",
    [propertyId],
  );
}

export async function createRule(input: {
  propertyId: string;
  conditions: RuleConditions;
  action: RuleAction;
  replyTemplate: string;
}): Promise<Rule> {
  const row = await queryOne<Rule>(
    `INSERT INTO rules (property_id, conditions, action, reply_template)
     VALUES ($1, $2, $3, $4)
     RETURNING id, property_id, conditions, action, reply_template, enabled`,
    [input.propertyId, JSON.stringify(input.conditions), input.action, input.replyTemplate],
  );
  return row!;
}

export async function updateRule(
  ruleId: string,
  patch: Partial<{ conditions: RuleConditions; action: RuleAction; replyTemplate: string; enabled: boolean }>,
): Promise<Rule | null> {
  return queryOne<Rule>(
    `UPDATE rules SET
       conditions = COALESCE($2, conditions),
       action = COALESCE($3, action),
       reply_template = COALESCE($4, reply_template),
       enabled = COALESCE($5, enabled)
     WHERE id = $1
     RETURNING id, property_id, conditions, action, reply_template, enabled`,
    [
      ruleId,
      patch.conditions !== undefined ? JSON.stringify(patch.conditions) : null,
      patch.action ?? null,
      patch.replyTemplate ?? null,
      patch.enabled ?? null,
    ],
  );
}

export async function ruleBelongsToHost(ruleId: string, hostId: string): Promise<boolean> {
  const row = await queryOne(
    "SELECT 1 FROM rules r JOIN properties p ON p.id = r.property_id WHERE r.id = $1 AND p.host_id = $2",
    [ruleId, hostId],
  );
  return row !== null;
}
