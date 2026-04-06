import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    applinks: {
      details: [
        {
          appIDs: ["A35W4MM59Y.edu.mit.OpenGrades"],
          components: [
            {
              "/": "*",
              comment: "Allow all paths",
            },
          ],
        },
      ],
    },
    webcredentials: {
      apps: ["A35W4MM59Y.edu.mit.OpenGrades"],
    },
  });
}
