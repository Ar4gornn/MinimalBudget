import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuoteCard } from "./QuoteCard";
import { AuthProvider } from "../auth/AuthContext";

/**
 * The line from the shelf (Epic 31).
 *
 * Two things worth holding: **"Next" sends the id on screen**, so the server can sort it
 * last — the client never draws, so the definition of "random" lives once; and **the card
 * is absent, not empty**, when nothing is kept or the request fails. It is the least
 * important thing on the dashboard and does not get to say so.
 */

function render() {
  return rtlRender(
    <MemoryRouter>
      <AuthProvider>
        <QuoteCard collapseKey="test.quote" />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const drawn = {
  id: "q1",
  book_id: "b1",
  text: "Let there be light.",
  page: 1,
  title: "Guards! Guards!",
  author: "Terry Pratchett",
};

function mockDraws(draws: (unknown | null)[]) {
  window.localStorage.setItem("everything-everywhere.token", "test-token");
  const urls: string[] = [];
  let n = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes("/api/auth/me")) {
        return json({ id: "u1", email: "sam@example.com", currency: "USD", created_at: "" });
      }
      if (url.includes("/api/books/quotes/draw")) {
        const body = draws[Math.min(n, draws.length - 1)];
        n += 1;
        return body instanceof Response ? body : json(body);
      }
      return json({ items: [] });
    }),
  );
  return urls;
}

describe("QuoteCard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows the drawn line with its book, author and page, linking to the shelf", async () => {
    mockDraws([drawn]);
    render();
    expect(await screen.findByText("Let there be light.")).toBeInTheDocument();
    expect(screen.getByText("A line from the shelf")).toBeInTheDocument();
    const source = screen.getByRole("link", { name: "Guards! Guards!, Terry Pratchett, p. 1" });
    expect(source).toHaveAttribute("href", "/books");
  });

  it("asks the server for the next one, naming the one on screen", async () => {
    const urls = mockDraws([drawn, { ...drawn, id: "q2", text: "Second line", page: null }]);
    const user = userEvent.setup();
    render();
    await screen.findByText("Let there be light.");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Second line")).toBeInTheDocument();
    expect(screen.queryByText("Let there be light.")).toBeNull();
    // No page: the source reads without one.
    expect(screen.getByRole("link", { name: "Guards! Guards!, Terry Pratchett" })).toBeInTheDocument();

    const draws = urls.filter((url) => url.includes("/quotes/draw"));
    expect(draws[0]).toMatch(/\/api\/books\/quotes\/draw$/);
    expect(draws[1]).toMatch(/\/api\/books\/quotes\/draw\?exclude=q1$/);
  });

  it("is absent when nothing is kept", async () => {
    const urls = mockDraws([null]);
    render();
    await waitFor(() => expect(urls.some((url) => url.includes("/quotes/draw"))).toBe(true));
    expect(screen.queryByText("A line from the shelf")).toBeNull();
  });

  it("is absent, not an error, when the request fails", async () => {
    const urls = mockDraws([json({ detail: "down" }, 500)]);
    render();
    await waitFor(() => expect(urls.some((url) => url.includes("/quotes/draw"))).toBe(true));
    expect(screen.queryByText("A line from the shelf")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
