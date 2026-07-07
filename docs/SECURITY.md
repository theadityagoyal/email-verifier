# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability within this project, please send an email to security@example.com. Do not disclose the issue publicly until we have had a chance to address it.

We will acknowledge receipt of your report within 48 hours and provide a timeline for resolution.

## Supported Versions

We provide security updates for the latest stable release only.

## Best Practices for Users

- Keep your dependencies up to date.
- Use environment variables for secrets (AWS keys, database passwords, SECRET_KEY).
- Restrict access to the API via firewall or API gateway.
- Enable HTTPS in production (via CloudFront, ALB, or reverse proxy).
- Regularly review logs for suspicious activity.

## Dependencies

We monitor dependencies using standard tools (pip, npm). If you find a vulnerable dependency, please report it via the above channel.