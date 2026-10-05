import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import StudyResponse from "./StudyResponse";
import AiCompanion from "./AiCompanion";
import Home from "@/pages/Home";
import { TODAY_STARTER } from "@/lib/studyPrompts";
import { http } from "@/lib/api";

vi.mock("@/lib/api", () => ({ http: { post: vi.fn() }, formatError: () => "Failed" }));
vi.mock("@/lib/usage", () => ({ useUsage: () => ({ usage: { credits_remaining: 10 }, setRemaining: vi.fn(), refresh: vi.fn() }) }));
vi.mock("./HelpUsage", () => ({ default: () => null }));

describe("student response presentation", () => {
  it("renders brief paragraphs, emphasis, ordered steps and code", () => {
    render(<StudyResponse text={'**Limits** describe a value.\n\n1. Factor.\n2. Substitute.\n\n```\nf(x) = x + 1\n```'} />);
    expect(screen.getByText("Limits").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("f(x) = x + 1").tagName).toBe("CODE");
  });
  it("never interprets HTML or unsafe link schemes", () => {
    const { container } = render(<StudyResponse text={'<img src=x onerror=alert(1)>\n\n[unsafe](javascript:alert) [source](https://example.com)'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link")).toHaveAttribute("rel", "noopener noreferrer");
  });
  it("fills the exact starter without sending or charging", () => {
    render(<MemoryRouter><AiCompanion open onClose={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: TODAY_STARTER }));
    expect(screen.getByRole("textbox", { name: "Your study question" })).toHaveValue(TODAY_STARTER);
    expect(http.post).not.toHaveBeenCalled();
  });
  it("gives visitors a readable problem statement and free signup", () => {
    render(<Home />);
    expect(screen.getByText(`“${TODAY_STARTER}”`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start studying for free/ })).toHaveAttribute("href", "/register");
  });
});
