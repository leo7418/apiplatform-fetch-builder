<?php

namespace App\Command;

use App\Entity\Company;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Tools\SchemaTool;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;

#[AsCommand(name: 'app:reset-database', description: 'Rebuilds the database: 3 companies, 25 users and no task.')]
final class ResetDatabaseCommand
{
    public function __construct(private readonly EntityManagerInterface $entityManager)
    {
    }

    public function __invoke(): int
    {
        $schemaTool = new SchemaTool($this->entityManager);
        $schemaTool->dropDatabase();
        $schemaTool->createSchema($this->entityManager->getMetadataFactory()->getAllMetadata());

        $companies = [];
        foreach (['Acme', 'Globex', 'Initech'] as $name) {
            $company = new Company();
            $company->name = $name;
            $this->entityManager->persist($company);
            $companies[] = $company;
        }

        // Users 1 to 5 work for Acme, 6 to 8 for Globex, the others for nobody.
        for ($i = 1; $i <= 25; ++$i) {
            $user = new User();
            $user->name = \sprintf('User %02d', $i);
            $user->email = \sprintf('user%02d@example.com', $i);
            $user->company = $i <= 5 ? $companies[0] : ($i <= 8 ? $companies[1] : null);
            $this->entityManager->persist($user);
        }

        $this->entityManager->flush();

        return Command::SUCCESS;
    }
}
