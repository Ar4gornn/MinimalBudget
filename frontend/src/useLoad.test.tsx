import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LanguageProvider, useLanguage } from "./i18n";
import { useLoad } from "./useLoad";

/** A promise settled from the outside, so a test decides the order answers land in. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Probe({ fetch, filter }: { fetch: (filter: string) => Promise<string[]>; filter: string }) {
  const { data, loading, failure, reload, setData } = useLoad(
    () => fetch(filter),
    [] as string[],
    [filter],
    "habits.couldNotLoad",
  );
  const { setLanguage } = useLanguage();
  return (
    <div>
      <p data-testid="state">{loading ? "loading" : "settled"}</p>
      <p data-testid="data">{data.join(",")}</p>
      {failure && <p role="alert">{failure}</p>}
      <button type="button" onClick={() => void reload()}>
        reload
      </button>
      <button type="button" onClick={() => setData((was) => [...was, "local"])}>
        append
      </button>
      <button type="button" onClick={() => void setLanguage("fr")}>
        fr
      </button>
    </div>
  );
}

function mount(fetch: (filter: string) => Promise<string[]>, filter = "a") {
  const view = render(
    <LanguageProvider>
      <Probe fetch={fetch} filter={filter} />
    </LanguageProvider>,
  );
  const rerender = (next: string) =>
    view.rerender(
      <LanguageProvider>
        <Probe fetch={fetch} filter={next} />
      </LanguageProvider>,
    );
  return { ...view, rerender };
}

const state = () => screen.getByTestId("state").textContent;
const data = () => screen.getByTestId("data").textContent;

describe("useLoad", () => {
  it("loads on mount and again when a dependency changes", async () => {
    const fetch = vi.fn(async (filter: string) => [filter]);
    const { rerender } = mount(fetch);
    expect(state()).toBe("loading");
    await screen.findByText("a");
    expect(state()).toBe("settled");

    rerender("b");
    await screen.findByText("b");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the answer to the latest question, whichever lands last", async () => {
    const first = deferred<string[]>();
    const second = deferred<string[]>();
    const fetch = vi.fn((filter: string) => (filter === "a" ? first.promise : second.promise));
    const { rerender } = mount(fetch);
    rerender("b");

    // The newer request answers first, then the stale one arrives late.
    await act(async () => second.resolve(["b"]));
    expect(data()).toBe("b");
    expect(state()).toBe("settled");
    await act(async () => first.resolve(["a"]));
    expect(data()).toBe("b");
  });

  it("drops a stale failure too", async () => {
    const first = deferred<string[]>();
    const fetch = vi.fn((filter: string) => (filter === "a" ? first.promise : Promise.resolve(["b"])));
    const { rerender } = mount(fetch);
    rerender("b");
    await screen.findByText("b");
    await act(async () => first.reject(new TypeError("Failed to fetch")));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says why it failed in the reader's language, without fetching again to say it", async () => {
    const fetch = vi.fn(async (_filter: string): Promise<string[]> => {
      throw new TypeError("Failed to fetch");
    });
    mount(fetch);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the server. Check your connection and try again.",
    );

    await userEvent.click(screen.getByRole("button", { name: "fr" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Serveur injoignable. Vérifiez votre connexion et réessayez.",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reloads on request and clears the failure when the reload succeeds", async () => {
    let fail = true;
    const fetch = vi.fn(async (filter: string) => {
      if (fail) throw new TypeError("Failed to fetch");
      return [filter];
    });
    mount(fetch);
    await screen.findByRole("alert");

    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "reload" }));
    await screen.findByText("a");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("lets the page edit the data in place", async () => {
    mount(async (filter) => [filter]);
    await screen.findByText("a");
    await userEvent.click(screen.getByRole("button", { name: "append" }));
    expect(data()).toBe("a,local");
  });
});
