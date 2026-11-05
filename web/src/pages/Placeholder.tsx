import type { RouteDef } from '../routes';

export function Placeholder({ route }: { route: RouteDef }) {
  return (
    <section>
      <h1>{route.title}</h1>
      <p>{route.summary}</p>
      <p className="muted">Placeholder. Built in {route.chunk}.</p>
    </section>
  );
}
