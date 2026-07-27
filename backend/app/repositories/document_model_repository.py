from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document_model import DocumentModel


class DocumentModelRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(self, workspace_id: str | None = None) -> list[DocumentModel]:
        statement = select(DocumentModel)
        if workspace_id is not None:
            statement = statement.where(DocumentModel.workspace_id == workspace_id)
        return list(self.db.scalars(statement.order_by(DocumentModel.name.asc())).all())

    def get(self, document_model_id: str) -> DocumentModel | None:
        return self.db.get(DocumentModel, document_model_id)

    def get_for_workspace(self, document_model_id: str, workspace_id: str) -> DocumentModel | None:
        return self.db.scalar(
            select(DocumentModel).where(DocumentModel.id == document_model_id, DocumentModel.workspace_id == workspace_id)
        )

    def get_by_name(self, name: str, workspace_id: str | None = None) -> DocumentModel | None:
        statement = select(DocumentModel).where(DocumentModel.name == name)
        if workspace_id is not None:
            statement = statement.where(DocumentModel.workspace_id == workspace_id)
        return self.db.scalar(statement)

    def save(self, document_model: DocumentModel) -> DocumentModel:
        self.db.add(document_model)
        self.db.commit()
        self.db.refresh(document_model)
        return document_model

    def delete(self, document_model: DocumentModel) -> None:
        self.db.delete(document_model)
        self.db.commit()
