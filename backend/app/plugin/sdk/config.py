"""
Plugin Configuration System
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ConfigField:
    """Schema definition for a single configuration field."""
    key: str
    label: str
    type: str = "string"
    description: str = ""
    default: Any = None
    required: bool = False
    secret: bool = False
    enum_values: Optional[List[str]] = None
    validation_pattern: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    min_length: Optional[int] = None
    max_length: Optional[int] = None


@dataclass
class ConfigSchema:
    """Configuration schema for a plugin."""
    fields: List[ConfigField] = field(default_factory=list)
    version: str = "1.0"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "fields": [
                {
                    "key": f.key,
                    "label": f.label,
                    "type": f.type,
                    "description": f.description,
                    "default": f.default,
                    "required": f.required,
                    "secret": f.secret,
                    "enum_values": f.enum_values,
                    "min_value": f.min_value,
                    "max_value": f.max_value,
                }
                for f in self.fields
            ],
            "version": self.version,
        }


class PluginConfig:
    """Plugin configuration manager."""

    def __init__(self, plugin_id: str, default_config: Dict[str, Any], config_schema: Optional[ConfigSchema] = None):
        self._plugin_id = plugin_id
        self._config = dict(default_config)
        self._schema = config_schema
        self._version = 1

    def get(self, key: str, default: Any = None) -> Any:
        return self._config.get(key, default)

    def set(self, key: str, value: Any) -> None:
        self._config[key] = value

    def update(self, config: Dict[str, Any]) -> None:
        self._config.update(config)
        self._version += 1

    @property
    def all(self) -> Dict[str, Any]:
        return dict(self._config)

    @property
    def version(self) -> int:
        return self._version

    def to_json(self) -> str:
        return json.dumps(self._config, indent=2)

    @classmethod
    def from_json(cls, plugin_id: str, json_str: str) -> PluginConfig:
        data = json.loads(json_str)
        return cls(plugin_id, data)

    def validate(self) -> List[str]:
        errors = []
        if not self._schema:
            return errors
        for field in self._schema.fields:
            value = self._config.get(field.key)
            if field.required and value is None:
                errors.append(f"{field.key} is required")
            if value is not None and field.type == "integer" and not isinstance(value, int):
                errors.append(f"{field.key} must be an integer")
        return errors
