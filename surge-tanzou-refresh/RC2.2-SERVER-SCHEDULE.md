# RC2.2 server schedule (Preview only)

Install the branch script on the existing sing-box server. Keep the subscription URL in a root-readable EnvironmentFile, never in GitHub.

systemd timer:
- OnCalendar=daily
- RandomizedDelaySec=30m
- Persistent=true
- service runs vmess_probe.py with --cache /var/lib/tanzou-probe/results.json

The cache contains no UUID/token/subscription secret. Do not publish it until the Vercel Preview reader is separately reviewed.
