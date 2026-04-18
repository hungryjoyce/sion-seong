// Dynamic Open Graph image — rendered at the edge on each crawl.
// Used in index.html's og:image and twitter:image meta tags so the
// link unfurls with a parchment preview instead of a blank card.

import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

export default function handler() {
  return new ImageResponse(
    {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5ecd7",
          backgroundImage:
            "radial-gradient(circle at 20% 15%, rgba(120,80,40,0.18), transparent 55%)," +
            "radial-gradient(circle at 80% 85%, rgba(90,60,30,0.22), transparent 60%)",
          color: "#3a2a1a",
          fontFamily: "serif",
          padding: "80px",
          position: "relative",
        },
        children: [
          // wax seal accent top-right
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                top: 60,
                right: 72,
                width: 110,
                height: 110,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle at 35% 30%, #d94a3a 0%, #8a1c1c 45%, #5c0f0f 80%)",
                color: "#f6d8c9",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: 3,
                boxShadow: "0 8px 18px rgba(0,0,0,0.35)",
              },
              children: "SEND",
            },
          },
          // title
          {
            type: "div",
            props: {
              style: {
                fontSize: 96,
                fontStyle: "italic",
                fontWeight: 600,
                lineHeight: 1.05,
                textAlign: "center",
                marginBottom: 28,
                maxWidth: 960,
              },
              children: "A Letter To Your Future Self",
            },
          },
          // tagline
          {
            type: "div",
            props: {
              style: {
                fontSize: 36,
                fontStyle: "italic",
                color: "#5a4431",
                textAlign: "center",
                maxWidth: 900,
                lineHeight: 1.3,
              },
              children:
                "Write today. Open it on a January morning, years from now.",
            },
          },
          // dashed divider
          {
            type: "div",
            props: {
              style: {
                marginTop: 46,
                width: 200,
                borderTop: "2px dashed #8a6a4a",
              },
            },
          },
        ],
      },
    },
    { width: 1200, height: 630 }
  );
}
