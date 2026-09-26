import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BooksPage } from "./BooksPage";
import { AuthProvider } from "../auth/AuthContext";
import { ToastProvider } from "../components/Toast";

/**
 * The shelf (Epic 28, story 28.2).
 *
 * Three behaviours here are the ones worth holding. **Start and Finished send only the
 * status** — the date the move implies is the server's to fill (AD-46), and a client that
 * sent `started_on: today` alongside would overwrite a date typed a moment earlier. **An
 * empty box goes on the wire as null, never as ""** — a cleared date as `""` is a 422 in the
 * API's language for something the person was entitled to do. And **the filters are sent,
 * not applied**: the page never decides for itself which books match.
 */

function render(path = "/books") {
  return rtlRender(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <ToastProvider>
          <BooksPage />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const me = {
  id: "u1",
  email: "sam@example.com",
  currency: "USD",
  weight_unit: "kg",
  budget_start_day: 1,
  created_at: "",
};

const book = (overrides: Record<string, unknown>) => ({
  id: "b1",
  title: "Guards! Guards!",
  author: "Terry Pratchett",
  series_id: "s1",
  series_name: "Discworld",
  series_order: 8,
  status: "to-read",
  rating: null,
  page_count: null,
  current_page: null,
  tags: "",
  note: null,
  added_on: "2026-09-01",
  started_on: null,
  finished_on: null,
  quotes: [] as unknown[],
  created_at: "",
  updated_at: "",
  ...overrides,
});

const shelf = [
  book({}),
  book({
    id: "b2",
    title: "Dune",
    author: "Frank Herbert",
    series_id: null,
    series_name: null,
    series_order: null,
    status: "reading",
    page_count: 600,
    current_page: 150,
    tags: "scifi, desert",
    started_on: `${new Date().getFullYear()}-09-10`,
  }),
  book({
    id: "b3",
    title: "Emma",
    author: "Jane Austen",
    series_id: null,
    series_name: null,
    series_order: null,
    status: "read",
    rating: 4,
    finished_on: "2024-08-20",
  }),
];

const series = [{ id: "s1", name: "Discworld", books: 1 }];

function mockApi(books = shelf) {
  window.localStorage.setItem("everything-everywhere.token", "test-token");
  const calls: { url: string; method: string; body: string }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: String(init?.body ?? "") });
    if (url.includes("/api/auth/me")) return json(me);
    if (url.includes("/api/books/series")) return json({ items: series });
    if (url.includes("/api/books/") && method === "PATCH") return json(books[0]);
    if (url.includes("/api/books/") && method === "DELETE") return json(null, 204);
    if (url.includes("/api/books") && method === "POST") return json(books[0], 201);
    if (url.includes("/api/books")) return json({ items: books });
    return json({ items: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

const bodies = (calls: { url: string; method: string; body: string }[], method: string) =>
  calls.filter((c) => c.method === method).map((c) => JSON.parse(c.body));

describe("BooksPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("lists each book with its author, series place, status and progress", async () => {
    mockApi();
    render();

    expect(await screen.findByText("Guards! Guards!")).toBeInTheDocument();
    expect(screen.getByText(/by Terry Pratchett · Discworld #8/)).toBeInTheDocument();
    expect(screen.getByText("3 books")).toBeInTheDocument();

    // The book being read shows the page as a bar and as words; the others do not.
    const bar = screen.getByRole("progressbar", { name: "Reading progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("page 150 of 600")).toBeInTheDocument();
    expect(screen.getByText(/scifi, desert/)).toBeInTheDocument();

    // The finished one shows when, and its stars.
    // Read in another year, so the year is written; the current-year rows carry none.
    expect(screen.getByText(/^Finished .*20 August 2024$/)).toBeInTheDocument();
    expect(screen.getByText(/^Started .*10 September · scifi, desert$/)).toBeInTheDocument();
    const stars = screen.getAllByRole("group", { name: "Rating" });
    expect(stars).toHaveLength(3);
  });

  it("offers Start on a book to read and Finished on one being read, sending only the status", async () => {
    const { calls } = mockApi();
    const user = userEvent.setup();
    render();
    await screen.findByText("Guards! Guards!");

    expect(screen.getAllByRole("button", { name: "Start" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Finished" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(bodies(calls, "PATCH")).toHaveLength(1));
    expect(bodies(calls, "PATCH")[0]).toEqual({ status: "reading" });
    expect(calls.find((c) => c.method === "PATCH")?.url).toMatch(/\/api\/books\/b1$/);

    await user.click(screen.getByRole("button", { name: "Finished" }));
    await waitFor(() => expect(bodies(calls, "PATCH")).toHaveLength(2));
    expect(bodies(calls, "PATCH")[1]).toEqual({ status: "read" });
  });

  it("rates with the stars, and pressing the lit star clears the rating", async () => {
    const { calls } = mockApi();
    const user = userEvent.setup();
    render();
    await screen.findByText("Emma");

    // Emma is rated 4: four lit, the fourth clears.
    const emma = screen.getByText("Emma").closest("li")!;
    expect(within(emma).getAllByRole("button", { pressed: true })).toHaveLength(4);
    await user.click(within(emma).getByRole("button", { name: "Rate 5 out of 5" }));
    await waitFor(() => expect(bodies(calls, "PATCH")).toHaveLength(1));
    expect(bodies(calls, "PATCH")[0]).toEqual({ rating: 5 });

    await user.click(within(emma).getByRole("button", { name: "Clear the rating" }));
    await waitFor(() => expect(bodies(calls, "PATCH")).toHaveLength(2));
    expect(bodies(calls, "PATCH")[1]).toEqual({ rating: null });
  });

  it("records the page you are on when the box is left, not on every keystroke", async () => {
    const { calls } = mockApi();
    const user = userEvent.setup();
    render();
    await screen.findByText("Dune");

    const box = screen.getByRole("spinbutton", {
      name: "Update the page for Dune",
    });
    await user.clear(box);
    await user.type(box, "200");
    expect(bodies(calls, "PATCH")).toHaveLength(0);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(bodies(calls, "PATCH")).toHaveLength(1));
    expect(bodies(calls, "PATCH")[0]).toEqual({ current_page: 200 });
  });

  it("adds a book with empty boxes as null, never as an empty string", async () => {
    const { calls } = mockApi();
    const user = userEvent.setup();
    render();
    await screen.findByText("Guards! Guards!");

    // Pasted, not typed: what is under test is the body sent, not the keystrokes, and each
    // keystroke re-renders the whole shelf. Forty-odd of them took two seconds alone and
    // ran past the five-second test timeout in a full parallel run.
    const fill = async (label: string, text: string) => {
      await user.click(screen.getByLabelText(label));
      await user.paste(text);
    };
    await fill("Title", "  Mort ");
    await fill("Author", "Terry Pratchett");
    await fill("Series (optional)", "Discworld");
    await fill("No. in series", "4");
    await fill("Tags, comma-separated", "fantasy");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(bodies(calls, "POST")).toHaveLength(1));
    const sent = bodies(calls, "POST")[0];
    expect(sent.title).toBe("Mort");
    expect(sent.series_name).toBe("Discworld");
    expect(sent.series_order).toBe(4);
    expect(sent.status).toBe("to-read");
    expect(sent.tags).toBe("fantasy");
    // Not "", and not 0: the boxes were empty.
    expect(sent.page_count).toBeNull();
    expect(sent.current_page).toBeNull();
    expect(sent.note).toBeNull();
    expect(sent.started_on).toBeNull();
    expect(sent.finished_on).toBeNull();
    // A new book always has the day it was added.
    expect(sent.added_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The form is clear again for the next one.
    expect(screen.getByLabelText("Title")).toHaveValue("");
  });

  it("edits in the same form, sending every box so a cleared one clears", async () => {
    const { calls } = mockApi();
    const user = userEvent.setup();
    render();
    await screen.findByText("Dune");

    await user.click(screen.getByRole("button", { name: "Edit Dune" }));
    expect(screen.getByRole("heading", { name: "Editing Dune" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Dune");
    expect(screen.getByLabelText("Pages")).toHaveValue(600);
    expect(screen.getByLabelText("Started on")).toHaveValue("2026-09-10");

    await user.clear(screen.getByLabelText("Started on"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(bodies(calls, "PATCH")).toHaveLength(1));
    const sent = bodies(calls, "PATCH")[0];
    expect(calls.find((c) => c.method === "PATCH")?.url).toMatch(/\/api\/books\/b2$/);
    expect(sent.started_on).toBeNull();
    expect(sent.page_count).toBe(600);
    expect(sent.current_page).toBe(150);
    expect(sent.tags).toBe("scifi, desert");
    // Back to adding.
    expect(screen.getByRole("heading", { name: "Add a book" })).toBeInTheDocument();
  });

  it("sends the filters to the server rather than filtering here", async () => {
    const { calls } = mockApi();
    const user = userEvent.setup();
    render();
    await screen.findByText("Guards! Guards!");

    await user.click(screen.getByRole("button", { name: "Reading" }));
    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith("/api/books?status=reading&sort=added"))).toBe(true),
    );

    await user.selectOptions(screen.getByLabelText("Sort by"), "rating");
    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith("/api/books?status=reading&sort=rating"))).toBe(true),
    );

    await user.type(screen.getByLabelText("Search the shelf"), "50%");
    await waitFor(() =>
      expect(
        calls.some((c) => c.url.endsWith("/api/books?q=50%25&status=reading&sort=rating")),
      ).toBe(true),
    );
  });

  it("starts on the status the dashboard linked to, then forgets it", async () => {
    const { calls } = mockApi();
    render("/books?status=reading");
    await screen.findByText("Guards! Guards!");
    expect(screen.getByRole("button", { name: "Reading" })).toHaveAttribute("aria-pressed", "true");
    expect(calls[0]?.url ?? calls[1]?.url).toMatch(/status=reading/);
  });

  it("says when the shelf is empty, and differently when nothing matches", async () => {
    mockApi([]);
    const user = userEvent.setup();
    render();
    expect(await screen.findByText(/No books yet/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Read" }));
    expect(await screen.findByText("Nothing on the shelf matches that.")).toBeInTheDocument();
  });

  it("deletes with an undo that puts the book back as it was", async () => {
    const { calls } = mockApi();
    const user = userEvent.setup();
    render();
    await screen.findByText("Emma");

    await user.click(screen.getByRole("button", { name: "Delete Emma" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(calls.find((c) => c.method === "DELETE")?.url).toMatch(/\/api\/books\/b3$/);

    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(bodies(calls, "POST")).toHaveLength(1));
    const sent = bodies(calls, "POST")[0];
    expect(sent.title).toBe("Emma");
    expect(sent.status).toBe("read");
    expect(sent.rating).toBe(4);
    expect(sent.finished_on).toBe("2024-08-20");
  });

  it("names the failure in the reader's words when the server refuses", async () => {
    mockApi();
    const user = userEvent.setup();
    render();
    await screen.findByText("Guards! Guards!");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/books") && init?.method === "POST") {
          return json(
            {
              detail: "finished before it was started",
              code: "book_dates_out_of_order",
            },
            422,
          );
        }
        if (url.includes("/api/books/series")) return json({ items: series });
        return json({ items: shelf });
      }),
    );
    await user.type(screen.getByLabelText("Title"), "Mort");
    await user.type(screen.getByLabelText("Author"), "Terry Pratchett");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A book cannot be finished before it was started.",
    );
  });

  // --- quotes (Epic 31)

  const quote = (overrides: Record<string, unknown>) => ({
    id: "q1",
    book_id: "b3",
    text: "It is a truth universally acknowledged…",
    page: 1,
    created_at: "",
    updated_at: "",
    ...overrides,
  });

  const withQuotes = (...quotes: Record<string, unknown>[]) =>
    shelf.map((b) => (b.id === "b3" ? { ...b, quotes } : b));

  it("draws each book's quotes under it, with the page when one was given", async () => {
    mockApi(withQuotes(quote({}), quote({ id: "q2", text: "Second line", page: null })));
    render();
    await screen.findByText("Emma");

    const emma = screen.getByText("Emma").closest("li")!;
    const list = within(emma).getByRole("list", { name: "Quotes from Emma" });
    const lines = within(list).getAllByRole("listitem");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent("It is a truth universally acknowledged… — p. 1");
    expect(lines[1]).toHaveTextContent("Second line");
    expect(lines[1]).not.toHaveTextContent("p.");
    // The toggle counts them; a book with none offers to add the first.
    expect(within(emma).getByRole("button", { name: "Edit quotes" })).toBeInTheDocument();
    const dune = screen.getByText("Dune").closest("li")!;
    expect(within(dune).getByRole("button", { name: "Add a quote" })).toBeInTheDocument();
    expect(within(dune).queryByRole("list")).toBeNull();
  });

  it("adds a quote from the panel, sending an empty page as null", async () => {
    const { calls } = mockApi();
    const user = userEvent.setup();
    render();
    await screen.findByText("Dune");

    const dune = screen.getByText("Dune").closest("li")!;
    await user.click(within(dune).getByRole("button", { name: "Add a quote" }));
    const panel = within(dune).getByRole("group", { name: "Quotes from Dune" });
    await user.type(within(panel).getByLabelText("The line"), "  Fear is the mind-killer.  ");
    await user.click(within(panel).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(bodies(calls, "POST")).toHaveLength(1));
    expect(calls.find((c) => c.method === "POST")?.url).toMatch(/\/api\/books\/b2\/quotes$/);
    expect(bodies(calls, "POST")[0]).toEqual({ text: "Fear is the mind-killer.", page: null });
  });

  it("edits a quote in place, and deletes it with an undo that puts it back", async () => {
    const { calls } = mockApi(withQuotes(quote({})));
    const user = userEvent.setup();
    render();
    await screen.findByText("Emma");

    const emma = screen.getByText("Emma").closest("li")!;
    await user.click(within(emma).getByRole("button", { name: "Edit quotes" }));
    const panel = within(emma).getByRole("group", { name: "Quotes from Emma" });

    await user.click(within(panel).getByRole("button", { name: "Edit quote" }));
    const box = within(panel).getByLabelText("The line");
    expect(box).toHaveValue("It is a truth universally acknowledged…");
    expect(within(panel).getByLabelText("Page")).toHaveValue(1);
    await user.clear(box);
    await user.type(box, "It is a truth universally acknowledged, that…");
    await user.click(within(panel).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(bodies(calls, "PATCH")).toHaveLength(1));
    expect(calls.find((c) => c.method === "PATCH")?.url).toMatch(/\/api\/books\/b3\/quotes\/q1$/);
    expect(bodies(calls, "PATCH")[0]).toEqual({
      text: "It is a truth universally acknowledged, that…",
      page: 1,
    });

    await user.click(within(panel).getByRole("button", { name: "Delete quote" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(calls.find((c) => c.method === "DELETE")?.url).toMatch(/\/api\/books\/b3\/quotes\/q1$/);

    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(bodies(calls, "POST")).toHaveLength(1));
    expect(calls.find((c) => c.method === "POST")?.url).toMatch(/\/api\/books\/b3\/quotes$/);
    expect(bodies(calls, "POST")[0]).toEqual({
      text: "It is a truth universally acknowledged…",
      page: 1,
    });
  });

  it("stops offering the form at ten, and says why", async () => {
    const ten = Array.from({ length: 10 }, (_, n) =>
      quote({ id: `q${n}`, text: `line ${n}`, page: null }),
    );
    mockApi(withQuotes(...ten));
    const user = userEvent.setup();
    render();
    await screen.findByText("Emma");

    const emma = screen.getByText("Emma").closest("li")!;
    await user.click(within(emma).getByRole("button", { name: "Edit quotes" }));
    const panel = within(emma).getByRole("group", { name: "Quotes from Emma" });
    expect(within(panel).queryByLabelText("The line")).toBeNull();
    expect(panel).toHaveTextContent("This book holds 10 quotes already. Remove one to add another.");
    // Editing one of the ten is still allowed: the cap is a count, not a lock.
    await user.click(within(panel).getAllByRole("button", { name: "Edit quote" })[0]!);
    expect(within(panel).getByLabelText("The line")).toHaveValue("line 0");
  });

  it("brings a deleted book's quotes back with it on undo", async () => {
    const { calls } = mockApi(withQuotes(quote({}), quote({ id: "q2", text: "Second", page: null })));
    const user = userEvent.setup();
    render();
    await screen.findByText("Emma");

    await user.click(screen.getByRole("button", { name: "Delete Emma" }));
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    // The book first, then each quote under the id the server gave the restored book.
    await waitFor(() => expect(bodies(calls, "POST")).toHaveLength(3));
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts[0]?.url).toMatch(/\/api\/books$/);
    expect(posts[1]?.url).toMatch(/\/api\/books\/b1\/quotes$/);
    expect(JSON.parse(posts[1]?.body ?? "")).toEqual({
      text: "It is a truth universally acknowledged…",
      page: 1,
    });
    expect(JSON.parse(posts[2]?.body ?? "")).toEqual({ text: "Second", page: null });
  });
});
