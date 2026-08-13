"""add report history metadata

Revision ID: 20260813_0001
Revises: 20260725_0001
Create Date: 2026-08-13
"""

from alembic import op
import sqlalchemy as sa


revision = "20260813_0001"
down_revision = "20260725_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("uploads", sa.Column("source_type", sa.String(length=40), nullable=True))
    op.add_column("uploads", sa.Column("source_url", sa.String(length=2000), nullable=True))
    op.add_column("generated_reports", sa.Column("custom_request", sa.Text(), nullable=True))
    op.add_column("generated_reports", sa.Column("report_context", sa.Text(), nullable=True))
    op.add_column("generated_reports", sa.Column("additional_instructions", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("generated_reports", "additional_instructions")
    op.drop_column("generated_reports", "report_context")
    op.drop_column("generated_reports", "custom_request")
    op.drop_column("uploads", "source_url")
    op.drop_column("uploads", "source_type")
