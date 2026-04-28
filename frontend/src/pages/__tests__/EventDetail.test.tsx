import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import EventDetail from "@/pages/EventDetail";

vi.mock("@/providers/trpc", () => ({
  trpc: {
    useUtils: () => ({
      event: {
        getById: { invalidate: vi.fn() },
        summary: { invalidate: vi.fn() },
        balances: { invalidate: vi.fn() },
      },
    }),
    event: {
      getById: {
        useQuery: () => ({
          data: {
            event: { id: 10, name: "Hunza Trip", description: "Mountains", currency: "PKR" },
            members: [
              { userId: 1, user: { name: "Huzzi" } },
              { userId: 2, user: { name: "Anas" } },
            ],
            expenses: [],
          },
          isLoading: false,
        }),
      },
      summary: {
        useQuery: () => ({ data: { budget: 5000, spent: 0, remaining: 5000, currency: "PKR" } }),
      },
      balances: {
        useQuery: () => ({ data: [] }),
      },
      addExpense: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

describe("EventDetail", () => {
  it("renders event detail summary", () => {
    render(
      <MemoryRouter initialEntries={["/events/10"]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Hunza Trip")).toBeInTheDocument();
    expect(screen.getByText("Budget")).toBeInTheDocument();
  });
});
