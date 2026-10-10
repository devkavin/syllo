"""Preserve BlockNote documents and notebook display preferences."""

from alembic import op
import sqlalchemy as sa

revision = "20261010_0010"
down_revision = "20261005_0009"
branch_labels = depends_on = None


def upgrade() -> None:
    op.add_column("notebooks", sa.Column("rich_content", sa.JSON(), nullable=True))
    # Server defaults also backfill existing notes without changing their text.
    op.add_column("notebooks", sa.Column("paper_style", sa.String(16), nullable=False, server_default="plain"))
    op.add_column("notebooks", sa.Column("font_style", sa.String(16), nullable=False, server_default="sans"))


def downgrade() -> None:
    with op.batch_alter_table("notebooks") as batch:
        batch.drop_column("font_style")
        batch.drop_column("paper_style")
        batch.drop_column("rich_content")
