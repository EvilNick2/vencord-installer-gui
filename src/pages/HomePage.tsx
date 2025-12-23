import UpdaterPanel from "../components/UpdaterPanel";
import DependencyPanel from "../components/DependencyPanel";

export default function HomePage() {
  return (
    <section className="home-grid">
      <UpdaterPanel />
      <DependencyPanel />
    </section>
  );
}