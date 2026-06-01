# TMAYD Bridge Staging Area

This directory is the temporary in-repo home for the Tell Me About Your Day
OptiPlex bridge. It is hardware-side code, not part of the public site runtime.

Current contents:

- `cloud-poller.py`: polls the TMAYD Cloudflare API for bridge work.
- `print-queue.py`: manages thermal receipt printing.
- `status-light.py`: updates the local status light state.
- `*.service`: systemd units for the deployed bridge host.
- `*.env.example`: sanitized environment shapes.
- `install.sh`: deployment-shaped installer for the OptiPlex host.
- `test_*.py`: local unit coverage for queue and light behavior.

The planned public home is a separate `tmayd-bridge` repository after the live
OptiPlex files are pulled and diffed against this copy. That extraction should
preserve the deployment-shaped layout first, then scrub live-only identifiers:
bearer tokens, real environment values, unnecessary private network details,
LIFX identifiers, and any submission text or queue state.

Once `tmayd-bridge` exists, this site repo should keep only a link to that
public repository.
