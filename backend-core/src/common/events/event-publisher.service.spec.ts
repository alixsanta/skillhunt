import { EventPublisherService, DomainEventType } from './event-publisher.service';

function makeRedisMock() {
  return { xadd: jest.fn().mockResolvedValue('1-0') } as any;
}

describe('EventPublisherService', () => {
  it('publish émet un XADD sur le stream avec type + payload aplati', async () => {
    const redis = makeRedisMock();
    const publisher = new EventPublisherService(redis);
    await publisher.publish(DomainEventType.GEAR_VALIDATED, { gearId: 'g1', freelanceId: 'f1' });
    expect(redis.xadd).toHaveBeenCalledWith(
      'skillhunt:events', '*',
      'type', 'gear.validated',
      'gearId', 'g1',
      'freelanceId', 'f1',
    );
  });

  it('best-effort : une erreur Redis est avalée (ne relance pas)', async () => {
    const redis = { xadd: jest.fn().mockRejectedValue(new Error('Redis down')) } as any;
    const publisher = new EventPublisherService(redis);
    await expect(publisher.publish(DomainEventType.GEAR_REJECTED, { gearId: 'g2' })).resolves.toBeUndefined();
  });
});
