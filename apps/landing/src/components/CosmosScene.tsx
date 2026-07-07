import { cssVars } from "../common/cssVars";

const planets = [
  { x: 16, y: 11, size: 64, colors: ["#F4C430", "#F47A7A"], ring: true, duration: 13, delay: 0 },
  { x: 78, y: 6, size: 96, colors: ["#6FA8FF", "#4EC8A0"], ring: false, duration: 17, delay: 1.5 },
  { x: 70, y: 64, size: 52, colors: ["#E59CC4", "#B79CFB"], ring: true, duration: 11, delay: 0.6 },
  { x: 30, y: 70, size: 38, colors: ["#B79CFB", "#6FA8FF"], ring: false, duration: 15, delay: 2.2 },
  { x: 50, y: 14, size: 30, colors: ["#F4C430", "#E59CC4"], ring: false, duration: 9, delay: 1 }
] as const;

const blobs = [
  { x: -8, y: 10, size: 320, color: "rgba(139,92,246,0.35)" },
  { x: 70, y: -12, size: 280, color: "rgba(244,196,48,0.18)" },
  { x: 30, y: 70, size: 360, color: "rgba(229,156,196,0.22)" }
] as const;

const sparks = Array.from({ length: 26 }, (_, index) => ({
  x: (index * 53) % 100,
  y: (index * 31) % 100,
  size: 2 + (index % 4),
  delay: (index % 7) * 0.4,
  duration: 2 + (index % 5)
}));

type CosmosSceneProps = {
  readonly ambient?: boolean;
};

export function CosmosScene({ ambient = false }: CosmosSceneProps) {
  return (
    <div className="cosmos-scene" aria-hidden="true">
      {blobs.map((blob, index) => (
        <span
          className="cosmos-scene__blob"
          key={`blob-${index}`}
          style={cssVars({
            "--blob-color": blob.color,
            "--blob-left": `${blob.x}%`,
            "--blob-opacity": ambient ? 0.6 : 1,
            "--blob-size": `${blob.size}px`,
            "--blob-top": `${blob.y}%`,
            "--blob-duration": `${16 + index * 4}s`,
            "--blob-delay": `-${index * 3}s`
          })}
        />
      ))}
      {sparks.map((spark, index) => (
        <span
          className="cosmos-scene__spark"
          key={`spark-${index}`}
          style={cssVars({
            "--spark-delay": `${spark.delay}s`,
            "--spark-duration": `${spark.duration}s`,
            "--spark-left": `${spark.x}%`,
            "--spark-opacity": ambient ? 0.5 : 0.8,
            "--spark-size": `${spark.size}px`,
            "--spark-top": `${spark.y}%`
          })}
        />
      ))}
      {!ambient &&
        planets.map((planet, index) => (
          <span
            className="cosmos-scene__planet"
            key={`planet-${index}`}
            style={cssVars({
              "--planet-a": planet.colors[0],
              "--planet-b": planet.colors[1],
              "--planet-delay": `-${planet.delay + planet.duration / 2}s`,
              "--planet-duration": `${planet.duration}s`,
              "--planet-left": `${planet.x}%`,
              "--planet-size": `${planet.size}px`,
              "--planet-top": `${planet.y}%`
            })}
          >
            <span className="cosmos-scene__planet-body" />
            {planet.ring ? <span className="cosmos-scene__planet-ring" /> : null}
          </span>
        ))}
    </div>
  );
}
