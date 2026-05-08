#!/bin/bash
#
# BinDist Test Runner
#
# This script can auto-configure the API URL from terraform output
# and then run the Python test suite.
#
# Usage:
#   ./run_tests.sh                  # Run all tests
#   ./run_tests.sh connectivity     # Run specific scenario
#   ./run_tests.sh --setup          # Generate test_config.env from terraform
#
# Prerequisites:
#   - Python 3.6+
#   - PowerShell Core (pwsh)
#   - terraform (for --setup)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

show_help() {
    echo "BinDist API Test Runner"
    echo ""
    echo "Usage: $0 [options] [scenarios...]"
    echo ""
    echo "Options:"
    echo "  --setup       Generate test_config.env from terraform output"
    echo "  --list        List available test scenarios"
    echo "  --help        Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 --setup                    # Setup config from terraform"
    echo "  $0                            # Run all tests"
    echo "  $0 connectivity               # Run connectivity tests only"
    echo "  $0 connectivity app_lifecycle # Run multiple scenarios"
}

setup_config() {
    echo -e "${YELLOW}Setting up test configuration from terraform...${NC}"

    cd "$PROJECT_DIR"

    # Check terraform is available
    if ! command -v terraform &> /dev/null; then
        echo -e "${RED}Error: terraform is required for --setup${NC}"
        exit 1
    fi

    # Get API endpoint from terraform
    API_URL=$(terraform output -raw api_endpoint 2>/dev/null || echo "")

    if [ -z "$API_URL" ]; then
        echo -e "${RED}Error: Could not get api_endpoint from terraform output${NC}"
        echo "Make sure you have deployed the infrastructure first."
        exit 1
    fi

    echo "API URL: $API_URL"

    # Check for existing config
    CONFIG_FILE="$SCRIPT_DIR/test_config.env"

    if [ -f "$CONFIG_FILE" ]; then
        echo -e "${YELLOW}Config file already exists: $CONFIG_FILE${NC}"
        read -p "Overwrite API URL? (y/N): " CONFIRM
        if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
            echo "Keeping existing config."
            return
        fi

        # Update just the API URL in existing file
        if grep -q "^BINDIST_API_URL=" "$CONFIG_FILE"; then
            sed -i "s|^BINDIST_API_URL=.*|BINDIST_API_URL=$API_URL|" "$CONFIG_FILE"
        else
            echo "BINDIST_API_URL=$API_URL" >> "$CONFIG_FILE"
        fi
        echo -e "${GREEN}Updated API URL in $CONFIG_FILE${NC}"
    else
        # Create new config file
        cat > "$CONFIG_FILE" << EOF
# BinDist Test Configuration
# Generated on $(date)

# API URL from terraform
BINDIST_API_URL=$API_URL

# Tenant ID (UUID format) - fill this in
TENANT_ID=

# API Secret - fill this in
API_SECRET=

# Path to PowerShell scripts
SCRIPTS_PATH=../../aws-exe-dist/scripts
EOF
        echo -e "${GREEN}Created $CONFIG_FILE${NC}"
        echo ""
        echo -e "${YELLOW}IMPORTANT: Edit $CONFIG_FILE and fill in:${NC}"
        echo "  - TENANT_ID"
        echo "  - API_SECRET"
    fi
}

run_tests() {
    cd "$SCRIPT_DIR"

    # Check Python is available
    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}Error: python3 is required${NC}"
        exit 1
    fi

    # Check PowerShell is available
    if ! command -v pwsh &> /dev/null; then
        echo -e "${RED}Error: PowerShell Core (pwsh) is required${NC}"
        echo "Install from: https://github.com/PowerShell/PowerShell"
        exit 1
    fi

    # Check config exists
    if [ ! -f "$SCRIPT_DIR/test_config.env" ]; then
        echo -e "${RED}Error: test_config.env not found${NC}"
        echo ""
        echo "Options:"
        echo "  1. Run '$0 --setup' to generate from terraform"
        echo "  2. Copy test_config.env.example to test_config.env and fill in values"
        exit 1
    fi

    # Run the Python test runner
    python3 "$SCRIPT_DIR/run_tests.py" "$@"
}

# Parse arguments
case "${1:-}" in
    --help|-h)
        show_help
        exit 0
        ;;
    --setup)
        setup_config
        exit 0
        ;;
    --list)
        run_tests --list
        exit 0
        ;;
    *)
        run_tests "$@"
        ;;
esac
