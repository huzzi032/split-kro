import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import Events from "@/pages/Events";

vi.mock("@/providers/trpc", () => ({
  trpc: {
    useUtils: () => ({
      event: { list: { invalidate: vi.fn() } },
    }),
    group: {
      list: {
        useQuery: () => ({
          data: [{ id: 1, name: "Dunify" }],
        }),
      },
    },
    event: {
      list: {
        useQuery: () => ({
          data: [
            {
              id: 10,
              name: "Hunza Trip",
              budget: 5000,
              currency: "PKR",
              memberCount: 3,
            },
          ],
          isLoading: false,
        }),
      },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

describe("Events", () => {
  it("renders events list", () => {
    render(
      <MemoryRouter>
        <Events />
      </MemoryRouter>,
    );

    expect(screen.getByText("Events & Trips")).toBeInTheDocument();
    expect(screen.getByText("Hunza Trip")).toBeInTheDocument();
  });
});
