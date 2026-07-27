"""create document models table

Revision ID: 20260725_0001
Revises:
Create Date: 2026-07-25
"""

from alembic import op
import sqlalchemy as sa


revision = "20260725_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_models",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=False),
        sa.Column("source_filename", sa.String(length=255), nullable=False),
        sa.Column("source_mime_type", sa.String(length=120), nullable=False),
        sa.Column("source_path", sa.String(length=500), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column("base_instructions", sa.Text(), nullable=False),
        sa.Column("default_context", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "name", name="uq_document_models_workspace_name"),
    )
    op.create_index(op.f("ix_document_models_workspace_id"), "document_models", ["workspace_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_document_models_workspace_id"), table_name="document_models")
    op.drop_table("document_models")
