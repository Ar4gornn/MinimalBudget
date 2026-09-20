import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import type { BookQuoteDraw } from "../api/types";
import { useT } from "../i18n";
import { Card } from "./ui";

/**
 * One line from the shelf, drawn at random by the server (Epic 31).
 *
 * Drawn on the dashboard and the calendar — the two pages opened without a task in mind,
 * where a sentence from a book is a small good thing to find. **On demand, not on a
 * timer:** "Next" asks the server for another, sending the id on screen so it is not the
 * same one back (unless it is the only one). Nothing rotates on its own; a page that
 * changes while it is being read is a distraction, not an ambience.
 *
 * **Absent rather than empty.** Until the first quote is kept there is no card, no "add
 * one" nudge: the shelf is where quotes are added, and the dashboard already has enough
 * to say. A failed request is treated the same way — this card is the least important
 * thing on either page and is not worth a banner.
 */
export function QuoteCard({ collapseKey }: { collapseKey: string }) {
  const t = useT();
  const [quote, setQuote] = useState<BookQuoteDraw | null>(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.drawBookQuote().then(
      (drawn) => {
        if (!cancelled) setQuote(drawn);
      },
      () => {
        if (!cancelled) setQuote(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function next() {
    if (!quote || drawing) return;
    setDrawing(true);
    try {
      const drawn = await api.drawBookQuote(quote.id);
      if (drawn) setQuote(drawn);
    } catch {
      // Keep the one on screen; a failed "Next" is not worth a message.
    } finally {
      setDrawing(false);
    }
  }

  if (!quote) return null;

  const source =
    quote.page === null
      ? t("quotes.from", { title: quote.title, author: quote.author })
      : t("quotes.fromPage", { title: quote.title, author: quote.author, page: quote.page });

  return (
    <div style={{ marginTop: 16 }} className="quote-card">
      <Card
        title={t("quotes.cardTitle")}
        collapseKey={collapseKey}
        summary={quote.title}
        actions={
          <button type="button" className="quiet" onClick={() => void next()} disabled={drawing}>
            {t("quotes.next")}
          </button>
        }
      >
        <blockquote>
          {quote.text}
          <cite>
            <Link to="/books">{source}</Link>
          </cite>
        </blockquote>
      </Card>
    </div>
  );
}
