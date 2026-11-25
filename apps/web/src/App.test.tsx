import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import abc123 from "./test/fixtures/abc123.json";
import demo01 from "./test/fixtures/demo01.json";
import { json, requestedBookingId, stubFetch } from "./test/fetch-mock";

const notFound = {
  type: "https://flynext.example/problems/booking-not-found",
  title: "Booking not found",
  status: 404,
  code: "BOOKING_NOT_FOUND",
  detail: "No synthetic booking matches the supplied identifier.",
  requestId: "req_test-404",
};

const field = () => screen.getByLabelText("Código de reserva");

describe("passenger experience", () => {
  it("shows the form and demo scenarios without querying or showing results", () => {
    const fetchMock = stubFetch(async () => json(abc123));
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Tu viaje cambia. Tu tranquilidad no." }),
    ).toBeVisible();
    expect(screen.getByText(/Demostración con datos sintéticos/)).toBeVisible();
    for (const id of ["ABC123", "DEMO01", "DEMO02"]) {
      expect(screen.getByRole("button", { name: new RegExp(id) })).toBeEnabled();
    }
    expect(screen.queryByRole("button", { name: /DEMO03/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Tu itinerario")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid code locally without calling the API", async () => {
    const fetchMock = stubFetch(async () => json(abc123));
    const user = userEvent.setup();
    render(<App />);

    await user.type(field(), "AB-12{Enter}");

    expect(screen.getByRole("alert")).toHaveTextContent(/letras o números/);
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes the code, submits with Enter and renders the ABC123 assessment", async () => {
    let release: (response: Response) => void = () => {};
    const fetchMock = stubFetch(() => new Promise((resolve) => (release = resolve)));
    const user = userEvent.setup();
    render(<App />);

    await user.type(field(), "  abc123 {Enter}");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestedBookingId(fetchMock.mock.calls[0]![1])).toBe("ABC123");
    expect(screen.getByRole("status")).toHaveTextContent("Consultando la reserva ABC123");
    expect(screen.queryByText("Tu itinerario")).not.toBeInTheDocument();

    release(json(abc123));

    expect(await screen.findByRole("heading", { name: "ABC123" })).toBeVisible();
    expect(screen.getByText("Evaluación parcial")).toBeVisible();
    // Messages come straight from the API.
    expect(screen.getByText(abc123.disruption.summary.message)).toBeVisible();
    expect(screen.getByText(abc123.recommendation.message.title)).toBeVisible();
    expect(screen.getByText(abc123.alternatives.options[0]!.message.title)).toBeVisible();
    expect(screen.getByText("Conexión en riesgo")).toBeVisible();
    expect(screen.getByText(/Llegada proyectada/)).toBeVisible();
    expect(screen.getByText(/No se ejecutó ningún cambio/)).toBeVisible();
  });

  it("attaches delay and gate to the right flight", async () => {
    stubFetch(async () => json(abc123));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /ABC123/ }));

    const la500 = (await screen.findByText("LA500")).closest("li")!;
    const la2410 = screen.getByText("LA2410").closest("li")!;
    expect(within(la500).getByText("Retraso confirmado: 160 min")).toBeVisible();
    expect(within(la500).getByText("Puerta 24")).toBeVisible();
    expect(within(la2410).queryByText(/Retraso confirmado/)).not.toBeInTheDocument();
    expect(within(la2410).getByText("Puerta sin informar")).toBeVisible();
    expect(within(la2410).getByText("Sin retraso informado")).toBeVisible();
  });

  it("runs a demo scenario through the same flow and shows a complete assessment", async () => {
    const fetchMock = stubFetch(async () => json(demo01));
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /DEMO01/ }));

    expect(await screen.findByRole("heading", { name: "DEMO01" })).toBeVisible();
    expect(requestedBookingId(fetchMock.mock.calls[0]![1])).toBe("DEMO01");
    expect(screen.getByText("Evaluación completa")).toBeVisible();
    expect(screen.getByText(demo01.disruption.summary.message)).toBeVisible();
  });

  it("clears the previous result when starting a new query", async () => {
    stubFetch(async () => json(abc123));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /ABC123/ }));
    await screen.findByText("Tu itinerario");

    await user.click(screen.getByRole("button", { name: "Consultar otra reserva" }));

    expect(screen.queryByText("Tu itinerario")).not.toBeInTheDocument();
    expect(field()).toHaveValue("");
  });

  it("explains an unknown booking", async () => {
    stubFetch(async () => json(notFound, 404));
    const user = userEvent.setup();
    render(<App />);

    await user.type(field(), "ZZZ999{Enter}");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No encontramos esa reserva");
    expect(alert).toHaveTextContent("req_test-404");
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });

  it("reports a network failure and lets the user retry", async () => {
    let calls = 0;
    stubFetch(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Failed to fetch");
      return json(abc123);
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /ABC123/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos conectarnos");

    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "ABC123" })).toBeVisible();
  });

  it("rejects a response that breaks the shared contract", async () => {
    stubFetch(async () => json({ requestId: "x", assessmentStatus: "COMPLETE" }));
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /ABC123/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos interpretar la respuesta",
    );
    expect(screen.queryByText("Tu itinerario")).not.toBeInTheDocument();
  });
});
