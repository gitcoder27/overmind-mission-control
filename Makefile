.PHONY: dev-up dev-down dev-status dev-logs dev-doctor

dev-up:
	./scripts/dev-doctor.sh
	./dev-stack.sh start

dev-down:
	./dev-stack.sh stop

dev-status:
	./dev-stack.sh status

dev-logs:
	./dev-stack.sh logs

dev-doctor:
	./scripts/dev-doctor.sh

smoke:
	./scripts/smoke-dev-stack.sh
