"""
RabbitMQ Message Bus Implementation
Async event publishing and consumption using aio-pika.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Callable, Dict, Optional

import aio_pika
from aio_pika import ExchangeType, Message, DeliveryMode
from aio_pika.abc import AbstractIncomingMessage

from app.core.config import settings
from app.core.events import DomainEvent, EventBus, EventHandler

logger = logging.getLogger(__name__)


class RabbitMQBus(EventBus):
    """RabbitMQ-based event bus implementation."""

    def __init__(self):
        self._connection: Optional[aio_pika.RobustConnection] = None
        self._channel: Optional[aio_pika.RobustChannel] = None
        self._exchange: Optional[aio_pika.RobustExchange] = None
        self._handlers: Dict[str, EventHandler] = {}
        self._connected = False

    async def connect(self) -> None:
        """Connect to RabbitMQ and declare exchange/queues."""
        if self._connected:
            return
        try:
            self._connection = await aio_pika.connect_robust(
                settings.rabbitmq_url,
                heartbeat=30,
            )
            self._channel = await self._connection.channel()
            await self._channel.set_qos(prefetch_count=10)

            # Declare the main events exchange
            self._exchange = await self._channel.declare_exchange(
                "v8.events",
                ExchangeType.TOPIC,
                durable=True,
            )

            # Declare dead letter exchange and queue
            self._dlx = await self._channel.declare_exchange(
                "v8.events.dlx",
                ExchangeType.DIRECT,
                durable=True,
            )
            self._dlq = await self._channel.declare_queue(
                "v8.events.dlq",
                durable=True,
            )
            await self._dlq.bind(self._dlx, routing_key="dead-letter")

            self._connected = True
            logger.info("[RabbitMQ] Connected and exchange declared")
        except Exception as e:
            logger.warning(f"[RabbitMQ] Connection failed: {e}")
            raise

    async def disconnect(self) -> None:
        """Disconnect from RabbitMQ."""
        if self._connection:
            await self._connection.close()
            self._connected = False
            logger.info("[RabbitMQ] Disconnected")

    async def publish(self, event: DomainEvent) -> None:
        """Publish a domain event to the message bus."""
        if not self._connected:
            logger.warning("[RabbitMQ] Not connected, cannot publish")
            return

        try:
            message_body = json.dumps({
                "event_id": event.event_id,
                "event_type": event.event_type,
                "event_version": event.event_version,
                "correlation_id": event.correlation_id,
                "timestamp": event.timestamp.isoformat(),
                "priority": event.priority.value,
                "metadata": event.metadata,
                "data": {k: v for k, v in event.__dict__.items() if k not in (
                    "event_id", "event_type", "event_version", "correlation_id",
                    "timestamp", "priority", "metadata"
                )},
            }).encode()

            message = Message(
                body=message_body,
                delivery_mode=DeliveryMode.PERSISTENT,
                message_id=event.event_id,
                correlation_id=event.correlation_id or "",
                headers={
                    "event_type": event.event_type,
                    "event_version": str(event.event_version),
                    "priority": str(event.priority.value),
                },
            )

            routing_key = event.event_type.replace(" ", ".").lower()
            await self._exchange.publish(message, routing_key=routing_key)
            logger.debug(f"[RabbitMQ] Published event: {event.event_type}")
        except Exception as e:
            logger.error(f"[RabbitMQ] Publish error: {e}")

    async def subscribe(self, event_type: str, handler: EventHandler) -> None:
        """Subscribe to events of a specific type."""
        if not self._connected:
            return

        queue_name = f"v8.{event_type.lower().replace(' ', '.')}"
        queue = await self._channel.declare_queue(queue_name, durable=True)

        routing_key = event_type.replace(" ", ".").lower()
        await queue.bind(self._exchange, routing_key=routing_key)

        self._handlers[event_type] = handler

        async def process_message(message: AbstractIncomingMessage) -> None:
            async with message.process():
                try:
                    body = json.loads(message.body.decode())
                    event_data = body.get("data", {})
                    # Reconstruct and handle the event
                    await handler(event_data)
                except Exception as e:
                    logger.error(f"[RabbitMQ] Handler error: {e}")
                    # Send to dead letter queue
                    await self._dlx.publish(
                        message,
                        routing_key="dead-letter",
                    )

        await queue.consume(process_message)
        logger.info(f"[RabbitMQ] Subscribed to: {event_type}")

    async def unsubscribe(self, event_type: str, handler: EventHandler) -> None:
        """Unsubscribe from an event type."""
        self._handlers.pop(event_type, None)
