from pydantic import BaseModel, ConfigDict


class ApiModel(BaseModel):
    """camelCase on the wire, snake_case in Python — the TS client stays idiomatic."""

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=lambda s: "".join(
            w if i == 0 else w.capitalize() for i, w in enumerate(s.split("_"))
        ),
        populate_by_name=True,
    )


class Page[T](ApiModel):
    items: list[T]
    total: int
    limit: int
    offset: int
