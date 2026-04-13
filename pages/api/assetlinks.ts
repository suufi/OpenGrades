import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json([{
        relation: [
            "delegate_permission/common.handle_all_urls",
            "delegate_permission/common.get_login_creds"
        ],
        target: {
            namespace: "android_app",
            package_name: "edu.mit.OpenGrades",
            sha256_cert_fingerprints: [
                "C8:1A:7E:3D:D7:5F:45:5D:19:FD:AB:2F:60:80:B2:46:B1:85:36:2E:EB:C1:54:A2:62:D5:9A:BB:5F:3B:D2:D8",
            ]
        }
    }]);
}


