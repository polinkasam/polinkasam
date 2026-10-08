export const projects = [
  { id: "kineze", title: "Kinese", image: "/x.jpg", filter: "Spatial & Installation", tags: ["Pavilion"], height: 34 },
  { id: "writings", title: "Writings", image: "/w.jpg", filter: "Writing", tags: ["Poetry"], height: 28 },
];
export const cinematicFilmProjects = [
  { id: "aether-motion", title: "AETHER Motion", timestamp: "00:12", image: "/a.jpg" },
];
export const archiveIndexCategories = [
  {
    id: "apps-code",
    title: "APPS & CODE",
    projects: [
      { id: "leira", title: "Leira", description: "Song lyrics practice app.", image: "/l.png", href: "https://leira.vercel.app", kind: "app", stack: ["React", "Vite"], features: ["Transliteration"] },
      { id: "secret-tool", title: "Secret Tool", description: "Hidden one.", image: "/s.png", kind: "app", hidden: true },
    ],
  },
  {
    id: "spatial",
    title: "SPATIAL & INSTALLATION",
    projects: [
      { id: "kineze", title: "Kinese", description: "Interactive pavilion.", image: "/k.jpg", kind: "architecture", materials: ["Steel"] },
    ],
  },
];
