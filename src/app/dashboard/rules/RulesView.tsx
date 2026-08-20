"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Property, Rule } from "@/lib/types.ts";

export default function RulesView({ properties }: { properties: Property[] }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [rules, setRules] = useState<Rule[]>([]);

  async function load(id: string) {
    if (!id) return;
    const res = await fetch(`/api/rules?propertyId=${id}`);
    setRules(res.ok ? await res.json() : []);
  }

  useEffect(() => {
    load(propertyId);
  }, [propertyId]);

  if (properties.length === 0) return <p className="empty-page">No properties configured yet.</p>;

  return (
    <>
      <h1>Auto-response rules</h1>
      <label className="filter">
        Property
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <table>
        <thead>
          <tr>
            <th>Conditions</th>
            <th>Action</th>
            <th>Reply</th>
            <th>Enabled</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <RuleRow key={rule.id} rule={rule} onChanged={() => load(propertyId)} />
          ))}
          {rules.length === 0 && (
            <tr>
              <td colSpan={5} className="empty">
                No rules yet — dates being available is the only condition until you add one.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <NewRuleForm propertyId={propertyId} onCreated={() => load(propertyId)} />
    </>
  );
}

function RuleRow({ rule, onChanged }: { rule: Rule; onChanged: () => void }) {
  async function toggle() {
    await fetch(`/api/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    onChanged();
  }

  return (
    <tr>
      <td data-label="Conditions">
        {rule.conditions.min_nights !== undefined && <div>min {rule.conditions.min_nights} nights</div>}
        {rule.conditions.min_price_per_night !== undefined && (
          <div>price ≥ {rule.conditions.min_price_per_night}</div>
        )}
        {Object.keys(rule.conditions).length === 0 && <div>dates available</div>}
      </td>
      <td data-label="Action">{rule.action}</td>
      <td data-label="Reply">{rule.reply_template}</td>
      <td data-label="Enabled">{rule.enabled ? "yes" : "no"}</td>
      <td>
        <button className="secondary" onClick={toggle}>
          {rule.enabled ? "Disable" : "Enable"}
        </button>
      </td>
    </tr>
  );
}

function NewRuleForm({ propertyId, onCreated }: { propertyId: string; onCreated: () => void }) {
  const [minNights, setMinNights] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [action, setAction] = useState<"auto_confirm" | "auto_reply">("auto_confirm");
  const [replyTemplate, setReplyTemplate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const conditions: Record<string, number> = {};
    if (minNights) conditions.min_nights = Number(minNights);
    if (minPrice) conditions.min_price_per_night = Number(minPrice);

    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, conditions, action, replyTemplate }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("Could not create the rule.");
      return;
    }
    setMinNights("");
    setMinPrice("");
    setReplyTemplate("");
    onCreated();
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2>New rule</h2>
      <label>
        Minimum nights (optional)
        <input type="number" min={1} value={minNights} onChange={(e) => setMinNights(e.target.value)} />
      </label>
      <label>
        Minimum accepted price per night (optional)
        <input type="number" min={0} value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
      </label>
      <label>
        Action
        <select value={action} onChange={(e) => setAction(e.target.value as "auto_confirm" | "auto_reply")}>
          <option value="auto_confirm">Auto-confirm the booking</option>
          <option value="auto_reply">Auto-reply only</option>
        </select>
      </label>
      <label>
        Reply message
        <textarea value={replyTemplate} onChange={(e) => setReplyTemplate(e.target.value)} rows={3} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create rule"}
      </button>
    </form>
  );
}
